import { dayInputs, fingerprint, simulate, validateConfig } from './engine'
import { eventActiveOn, eventAffects } from './events'
import { EFFECT_BY_ID, ENV_BY_KEY, ENV_PARAMS, NOMINAL_ENVIRONMENT, SLEEP_MODEL, outOfRange } from './reference'
import type { AstronautProfile, AstronautRun, EnvKey, MissionConfig, MissionEvent, SimIndicator, SimulationResult } from './types'

/**
 * Readiness assessment: a 0–100 score for one astronaut on one mission day,
 * built from five areas with explicit formulas and published reference points,
 * plus the weaknesses behind any lost points, what caused them in the model,
 * what the astronaut's own data shows, and a recommendation whose effect is
 * checked by re-running the simulation.
 *
 * Every input is a 7-day mean (or a cumulative state such as sleep debt, bone
 * loss or radiation dose), so the score moves with the underlying physiology
 * rather than with day-to-day noise. Absolute references are used where the
 * literature gives one (sleep need, blood-pressure stages, radiation limits,
 * cabin ranges); personal pre-flight baselines are used where only change is
 * meaningful (heart rate, HRV). Weights are AURORA's operational choice, not
 * a validated clinical instrument.
 */

export type DomainId = 'sleep' | 'behavioral' | 'musculo' | 'cardio' | 'exposure'

export const DOMAINS: { id: DomainId; label: string; weight: number; covers: string }[] = [
  { id: 'sleep', label: 'Sleep and alertness', weight: 0.3, covers: 'Accumulated sleep debt against the person’s sleep need, expected reaction-test lapses, sleep quality and regularity.' },
  { id: 'behavioral', label: 'Behavioral health', weight: 0.2, covers: 'Fatigue, stress and mood check-ins.' },
  { id: 'musculo', label: 'Muscle and bone', weight: 0.2, covers: 'Strength and bone loss from pre-flight, and exercise against the countermeasure dose.' },
  { id: 'cardio', label: 'Cardiopulmonary', weight: 0.15, covers: 'Resting heart rate and HRV against the pre-flight baseline, blood-pressure stage, oxygen saturation.' },
  { id: 'exposure', label: 'Cabin and radiation exposure', weight: 0.15, covers: 'Cabin conditions outside reference ranges, and radiation dose against the career limit.' },
]

/** One weak area cannot be averaged away: the score is at most the weakest area + this margin. */
export const WEAKEST_LINK_MARGIN = 30
/** NASA-STD-3001 Vol. 1 Rev. B (2022): career effective-dose limit for all astronauts. */
export const CAREER_LIMIT_MSV = 600
/** Exercise minutes per day the model treats as the full countermeasure dose. */
export const EXERCISE_DOSE_MIN = 60

export type Severity = 'minor' | 'moderate' | 'major'

export interface Cause {
  effectId: string
  label: string
  /** Mean contribution per day over the window, in the finding's unit. */
  amount: number
  share: number
}

export interface Recommendation {
  key: string
  action: string
  why: string
  /** How to test it: a change to the mission, applied from tomorrow where possible. */
  plan?: (m: MissionConfig, day: number) => { config: MissionConfig; from: 'tomorrow' | 'start' }
}

export interface Finding {
  id: string
  domain: DomainId
  severity: Severity
  title: string
  evidence: string
  source: string
  /** Points lost in its area, and in the overall score. */
  points: number
  impact: number
  causes: Cause[]
  causeUnit: string
  /** What the astronaut's own simulated data shows, when the link is clear enough to report. */
  observed: string | null
  recommendation: Recommendation | null
}

export interface DomainResult {
  id: DomainId
  label: string
  weight: number
  score: number
  findings: Finding[]
}

export interface Assessment {
  astronautId: string
  name: string
  day: number
  from: number
  to: number
  score: number
  /** Weighted mean of the areas before the weakest-area limit. */
  weighted: number
  capped: boolean
  status: 'nominal' | 'watch' | 'caution'
  domains: DomainResult[]
  findings: Finding[]
  /** Change against 7 days earlier. */
  trend: number | null
}

const r1 = (v: number) => (Math.round(v * 10) / 10).toString()
const r0 = (v: number) => Math.round(v).toString()

function meanOf(a: Float32Array, from: number, to: number): number {
  let s = 0
  for (let d = from; d <= to; d++) s += a[d - 1]
  return s / (to - from + 1)
}

function severityOf(points: number): Severity {
  return points >= 30 ? 'major' : points >= 12 ? 'moderate' : 'minor'
}

export function statusOf(score: number): Assessment['status'] {
  return score >= 80 ? 'nominal' : score >= 65 ? 'watch' : 'caution'
}

/** Model attribution: mean daily contribution of each effect to the indicator, in the harmful direction. */
function causesFor(run: AstronautRun, indicators: SimIndicator[], from: number, to: number, harmful: 1 | -1, only?: string[]): Cause[] {
  const totals = new Map<string, number>()
  for (const c of run.contributions) {
    if (!indicators.includes(c.indicator)) continue
    if (only && !only.includes(c.effectId)) continue
    let s = 0
    for (let d = from; d <= to; d++) s += c.daily[d - 1]
    s = (s / (to - from + 1)) * harmful
    if (s > 1e-3) totals.set(c.effectId, (totals.get(c.effectId) ?? 0) + s)
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0)
  return [...totals.entries()]
    .map(([effectId, amount]) => ({ effectId, label: EFFECT_BY_ID[effectId]?.label ?? effectId, amount, share: sum ? amount / sum : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/** Pearson correlation of x(t) with y(t + lag) over a window. */
export function laggedCorrelation(x: Float32Array, y: Float32Array, from: number, to: number, lag: number): { r: number; n: number } {
  const xs: number[] = []
  const ys: number[] = []
  for (let d = from; d + lag <= to; d++) {
    xs.push(x[d - 1])
    ys.push(y[d - 1 + lag])
  }
  const n = xs.length
  if (n < 3) return { r: 0, n }
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return { r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0, n }
}

function observedLink(run: AstronautRun, name: string, x: SimIndicator, xLabel: string, y: SimIndicator, yLabel: string, day: number, lag: number): string | null {
  const from = Math.max(1, day - 27)
  const { r, n } = laggedCorrelation(run.daily[x], run.daily[y], from, day, lag)
  if (n < 14 || Math.abs(r) < 0.3) return null
  const when = lag ? ' the next day' : ' the same day'
  return `In ${name}'s own data for days ${from}–${day}, ${xLabel} was followed by ${r < 0 ? 'higher' : 'lower'} ${yLabel}${when} (r = ${r.toFixed(2).replace('-', '−')} over ${n} day pairs).`
}

// ------------------------------------------------------------ recommendations

function futureEvent(id: string, type: MissionEvent['type'], title: string, day: number, days: number, who: string, params: Record<string, number>, envOverride?: MissionEvent['envOverride']): MissionEvent {
  return { id: `WHATIF-${id}`, type, title, startDay: day + 1, durationDays: Math.max(1, days - day), crewWide: false, astronautIds: [who], params, notes: '', envOverride }
}

/** Apply from tomorrow as a scheduled event, or from mission start when there is no time left. */
function fromTomorrow(m: MissionConfig, day: number, make: (day: number) => MissionEvent): { config: MissionConfig; from: 'tomorrow' | 'start' } {
  const start = day >= m.durationDays - 2 ? 0 : day
  return { config: { ...m, events: [...m.events, make(start)] }, from: start === 0 ? 'start' : 'tomorrow' }
}

interface Ctx {
  config: MissionConfig
  person: AstronautProfile
  run: AstronautRun
  day: number
  from: number
  to: number
  name: string
  need: number
}

function eventsInWindow(ctx: Ctx, test: (e: MissionEvent) => boolean): MissionEvent[] {
  return ctx.config.events.filter((e) => eventAffects(e, ctx.person.id) && test(e) && Array.from({ length: ctx.to - ctx.from + 1 }, (_, k) => ctx.from + k).some((d) => eventActiveOn(e, d)))
}

function sleepRecommendation(ctx: Ctx, topCause: string | undefined): Recommendation {
  const { person, name, need } = ctx
  const period = person.schedule.sleepHours
  const target = Math.min(12, Math.ceil((need / SLEEP_MODEL.efficiency) * 4) / 4)
  if (topCause === 'habitual-sleep') {
    return {
      key: 'sleep-habit',
      action: `Treat ${name}'s short usual sleep (${person.baseline.sleepNeed} h against an ${need} h need) as a medical-operations issue: review with the flight surgeon, protect the whole sleep period, track sleep by actigraphy, and avoid assigning safety-critical tasks (EVA, robotics, docking) while reaction-test lapses stay high.`,
      why: `The schedule allows more sleep than ${name} takes, so a longer sleep period alone will not help. Chronic restriction keeps degrading performance without levelling off (Van Dongen et al., 2003).`,
      plan: (m) => ({
        config: { ...m, crew: m.crew.map((c) => (c.id === person.id ? { ...c, baseline: { ...c.baseline, sleepNeed: need }, schedule: { ...c.schedule, sleepHours: Math.max(c.schedule.sleepHours, target) } } : c)) },
        from: 'start',
      }),
    }
  }
  if (topCause === 'event-sleep-loss') {
    const evs = eventsInWindow(ctx, (e) => (e.params.sleepLossHours ?? 0) > 0)
    const loss = evs.reduce((a, e) => Math.max(a, e.params.sleepLossHours ?? 0), 0)
    return {
      key: 'sleep-events',
      action: `Add protected recovery sleep for ${name} after ${evs.length ? evs.map((e) => `“${e.title}”`).join(', ') : 'the sleep-disrupting events'}, or move them so they do not cut into the sleep period.`,
      why: `These events remove up to ${loss} h a night from the sleep period. Recovery after restriction takes several nights (Belenky et al., 2003).`,
      plan: (m, day) => fromTomorrow(m, day, (d) => futureEvent('sleep-recovery', 'recovery', 'Protected recovery sleep', d, m.durationDays, person.id, { extraSleepHours: Math.max(1, loss), workloadReduction: 0 })),
    }
  }
  if (topCause === 'noise-sleep' || topCause === 'co2-sleep' || topCause === 'temperature-sleep') {
    const key: EnvKey = topCause === 'noise-sleep' ? 'noiseDBA' : topCause === 'co2-sleep' ? 'co2mmHg' : 'cabinTempC'
    return environmentRecommendation(ctx, key, 'sleep')
  }
  if (topCause === 'circadian-shift') {
    return {
      key: 'sleep-circadian',
      action: `Move ${name}'s schedule in steps of no more than 1 h a day, with timed bright light, rather than in one large shift.`,
      why: 'Circadian misalignment shortens sleep in spaceflight (Flynn-Evans et al., 2016). The crew re-entrains at roughly an hour a day.',
    }
  }
  return {
    key: 'sleep-period',
    action: `Extend ${name}'s sleep period from ${period} h to ${target} h.`,
    why: `At about ${Math.round(SLEEP_MODEL.efficiency * 100)} % sleep efficiency a ${period} h period gives about ${r1(period * SLEEP_MODEL.efficiency)} h of sleep, short of the ${need} h need. ISS crews averaged about 6 h a night in 8.5 h periods (Barger et al., 2014).`,
    plan: (m, day) => fromTomorrow(m, day, (d) => futureEvent('sleep-period', 'recovery', 'Longer sleep period', d, m.durationDays, person.id, { extraSleepHours: Math.max(0.25, target - period), workloadReduction: 0 })),
  }
}

function exerciseRecommendation(ctx: Ctx): Recommendation {
  const { person, name } = ctx
  const s = person.schedule
  const outages = eventsInWindow(ctx, (e) => e.type === 'exercise-unavailable')
  const sessions = Math.max(6, s.exerciseSessionsPerWeek)
  const minutes = Math.max(Math.ceil((EXERCISE_DOSE_MIN * 7) / sessions / 5) * 5, s.exerciseMinutes)
  return {
    key: 'exercise',
    action: outages.length
      ? `Restore exercise for ${name}: ${outages.map((e) => `“${e.title}”`).join(', ')} is blocking it. Until it is fixed, schedule alternative resistive exercise, then return to ${sessions} sessions × ${minutes} min a week.`
      : `Raise ${name}'s countermeasure exercise to ${sessions} sessions × ${minutes} min a week (≥ ${EXERCISE_DOSE_MIN} min a day), resistive plus aerobic.`,
    why: `ISS crews are scheduled about 2.5 h of exercise a day including set-up (Loehr et al., 2015); resistive exercise limits strength and bone loss (Trappe et al., 2009; Stavnichuk et al., 2020). In the model, ${EXERCISE_DOSE_MIN} min a day is the full protective dose.`,
    plan: (m, day) => fromTomorrow(m, day, (d) => futureEvent('exercise', 'exercise-change', 'Countermeasure exercise restored', d, m.durationDays, person.id, { sessionsPerWeek: sessions, minutes })),
  }
}

function workloadRecommendation(ctx: Ctx): Recommendation {
  const { person, name } = ctx
  const w = person.schedule.workload
  const evs = eventsInWindow(ctx, (e) => (e.params.workloadIncrease ?? 0) > 0 || (e.params.stressIncrease ?? 0) > 0)
  return {
    key: 'workload',
    action: evs.length
      ? `Rebalance ${name}'s timeline around ${evs.map((e) => `“${e.title}”`).join(', ')}: shift tasks to other crew, protect off-duty time, and offer a private psychological conference.`
      : `Lower ${name}'s workload by one level (from ${w} to ${Math.max(1, w - 1)}), protect off-duty time, and offer a private psychological conference.`,
    why: 'In the model, workload sets stress, and stress raises heart rate and lowers HRV, sleep quality and mood. Workload and isolation are documented behavioral-health risks on long missions (NASA Human Research Program).',
    plan: (m, day) => fromTomorrow(m, day, (d) => futureEvent('workload', 'workload', 'Lighter timeline', d, m.durationDays, person.id, { workloadIncrease: -1, sleepLossHours: 0, stressIncrease: 0 })),
  }
}

function environmentRecommendation(ctx: Ctx, key: EnvKey, via: string): Recommendation {
  const p = ENV_BY_KEY[key]
  const target = NOMINAL_ENVIRONMENT[key]
  return {
    key: `env-${key}`,
    action: `Bring ${p.label.toLowerCase()} back to ${target} ${p.unit}${key === 'co2mmHg' ? ' (scrubber set-point or more CO₂ removal)' : key === 'noiseDBA' ? ' (quieter crew quarters or hearing protection for sleep)' : key === 'ppO2KPa' ? ' (raise oxygen partial pressure)' : ''}. This applies to the whole crew.`,
    why: `It is affecting ${ctx.name}'s ${via}. Reference: ${p.reference?.source ?? 'none'}`,
    plan: (m, day) => fromTomorrow(m, day, (d) => ({ ...futureEvent(`env-${key}`, 'environment-anomaly', `${p.label} restored`, d, m.durationDays, ctx.person.id, {}, { [key]: target }), crewWide: true })),
  }
}

/** The recommendation that addresses an effect, or null when none applies. */
function recommendFor(ctx: Ctx, effectId: string | undefined, via: string): Recommendation | null {
  switch (effectId) {
    case 'habitual-sleep':
    case 'sleep-opportunity':
    case 'event-sleep-loss':
    case 'circadian-shift':
      return sleepRecommendation(ctx, effectId)
    case 'sleep-debt-cardio':
    case 'sleep-debt-performance':
    case 'sleep-debt':
      return sleepRecommendation(ctx, sleepCauses(ctx)[0]?.effectId)
    case 'noise-sleep':
      return environmentRecommendation(ctx, 'noiseDBA', via)
    case 'co2-sleep':
    case 'co2-ventilation':
      return environmentRecommendation(ctx, 'co2mmHg', via)
    case 'temperature-sleep':
    case 'thermal-body-temperature':
      return environmentRecommendation(ctx, 'cabinTempC', via)
    case 'oxygen-saturation':
    case 'hypoxemia-heart-rate':
      return environmentRecommendation(ctx, 'ppO2KPa', via)
    case 'deconditioning':
    case 'muscle-deconditioning':
    case 'bone-loss':
    case 'exercise-log':
      return exerciseRecommendation(ctx)
    case 'workload-stress':
    case 'stress-cardio':
    case 'stress-sleep':
    case 'fatigue-model':
    case 'mood-model':
      return workloadRecommendation(ctx)
    default:
      return null
  }
}

const SLEEP_LOSS_EFFECTS = ['habitual-sleep', 'sleep-opportunity', 'event-sleep-loss', 'noise-sleep', 'co2-sleep', 'temperature-sleep', 'circadian-shift']

/** Why sleep falls short of need, over the last 3 weeks (the debt's memory). */
function sleepCauses(ctx: Ctx): Cause[] {
  return causesFor(ctx.run, ['sleepDuration'], Math.max(1, ctx.day - 20), ctx.day, -1, SLEEP_LOSS_EFFECTS)
}

// ------------------------------------------------------------------ scoring

function finding(f: Omit<Finding, 'severity' | 'impact'>, weight: number): Finding {
  return { ...f, severity: severityOf(f.points), impact: f.points * weight }
}

function assessCore(config: MissionConfig, result: SimulationResult, astronautId: string, day: number): Omit<Assessment, 'trend'> | null {
  const person = config.crew.find((c) => c.id === astronautId)
  const run = result.astronauts.find((a) => a.astronautId === astronautId)
  if (!person || !run) return null
  const d = Math.min(result.days, Math.max(1, Math.round(day)))
  const from = Math.max(1, d - 6)
  const to = d
  const name = person.name || person.id
  const need = person.baseline.sleepRequirement ?? SLEEP_MODEL.defaultNeedH
  const ctx: Ctx = { config, person, run, day: d, from, to, name, need }
  const D = run.daily
  const m = (k: SimIndicator) => meanOf(D[k], from, to)
  const w = Object.fromEntries(DOMAINS.map((x) => [x.id, x.weight])) as Record<DomainId, number>
  const found: Record<DomainId, Finding[]> = { sleep: [], behavioral: [], musculo: [], cardio: [], exposure: [] }
  const push = (dom: DomainId, f: Omit<Finding, 'severity' | 'impact' | 'domain'>) => {
    if (f.points >= 2) found[dom].push(finding({ ...f, domain: dom }, w[dom]))
  }
  const span = `days ${from}–${to}`

  // ---- Sleep and alertness
  const debt = D.sleepDebt[d - 1]
  const nights = debt / SLEEP_MODEL.nightEquivalentH
  const sleep7 = m('sleepDuration')
  const pvt7 = m('pvtLapses')
  const sc = sleepCauses(ctx)
  push('sleep', {
    id: 'sleep-debt',
    title: nights >= 0.9 ? `Sleep debt equal to ${r1(nights)} night${nights >= 1.05 ? 's' : ''} without sleep` : `Sleep debt building (${r0(debt)} h)`,
    evidence: `Sleeping ${r1(sleep7)} h a night over ${span} against a need of ${need} h. Estimated debt ${r0(debt)} h, which impairs performance about as much as ${r1(nights)} night(s) without sleep. Expected reaction-test lapses: ${r1(pvt7)} per 10-minute test (well rested ≈ ${SLEEP_MODEL.pvtRested}).${pvt7 >= 6 ? ` Self-rated sleepiness levels off under chronic restriction while lapses keep rising, so judge ${name} by the reaction test, not by how rested they say they feel.` : ''}`,
    source: 'Van Dongen et al., Sleep 26:117 (2003); Watson et al., Sleep 38:843 (2015) for the 7–9 h adult need; Barger et al., Lancet Neurol 13:904 (2014) for ISS sleep.',
    points: Math.min(80, 40 * nights),
    causes: sc,
    causeUnit: 'h/night short of need',
    observed: observedLink(run, name, 'sleepDuration', 'less sleep', 'pvtLapses', 'reaction-test lapses', d, 1),
    recommendation: sleepRecommendation(ctx, sc[0]?.effectId),
  })
  const q7 = m('sleepQuality')
  const qc = causesFor(run, ['sleepQuality'], from, to, -1)
  push('sleep', {
    id: 'sleep-quality',
    title: `Poor sleep quality (${r0(q7)}/100)`,
    evidence: `Sleep quality index averaged ${r0(q7)}/100 over ${span}; points are lost below 70.`,
    source: 'Modeled index: noise, CO₂, temperature, schedule shifts and stress reduce it (see the effect list).',
    points: Math.min(30, 0.6 * Math.max(0, 70 - q7)),
    causes: qc,
    causeUnit: 'quality points',
    observed: null,
    recommendation: recommendFor(ctx, qc[0]?.effectId, 'sleep quality'),
  })
  const c7 = m('sleepConsistency')
  push('sleep', {
    id: 'sleep-irregular',
    title: `Irregular sleep (consistency ${r0(c7)}/100)`,
    evidence: `Night-to-night sleep length varied enough to bring consistency to ${r0(c7)}/100 over ${span}; points are lost below 75.`,
    source: 'Derived from the standard deviation of the last 7 nights’ sleep.',
    points: Math.min(20, 0.5 * Math.max(0, 75 - c7)),
    causes: [],
    causeUnit: '',
    observed: null,
    recommendation: { key: 'sleep-regular', action: `Hold ${name}'s sleep start time fixed and keep sleep-disrupting tasks out of the sleep period.`, why: 'Irregular sleep usually traces to schedule disruption (night work, repairs, EVA preparation).' },
  })

  // ---- Behavioral health
  const f7 = m('fatigue')
  const fc = causesFor(run, ['fatigue'], from, to, 1)
  push('behavioral', {
    id: 'fatigue',
    title: `High fatigue (${r1(f7)}/10)`,
    evidence: `Fatigue averaged ${r1(f7)}/10 over ${span}; points are lost above 3.5.`,
    source: 'Modeled index (a self-report check-in on a real mission): sleep debt, stress, workload and EVA hours raise it.',
    points: Math.min(40, 7 * Math.max(0, f7 - 3.5)),
    causes: fc,
    causeUnit: 'fatigue points',
    observed: observedLink(run, name, 'sleepDuration', 'less sleep', 'fatigue', 'fatigue', d, 1),
    recommendation: recommendFor(ctx, fc[0]?.effectId, 'fatigue'),
  })
  const s7 = m('stress')
  const stc = causesFor(run, ['stress'], from, to, 1)
  push('behavioral', {
    id: 'stress',
    title: `Elevated stress (${r1(s7)}/10)`,
    evidence: `Stress averaged ${r1(s7)}/10 over ${span} (workload level ${person.schedule.workload}); points are lost above 4.5.`,
    source: 'Modeled index: workload, stressful events and sleep debt raise it.',
    points: Math.min(35, 6 * Math.max(0, s7 - 4.5)),
    causes: stc,
    causeUnit: 'stress points',
    observed: null,
    recommendation: recommendFor(ctx, stc[0]?.effectId, 'stress'),
  })
  const mo7 = m('mood')
  const mc = causesFor(run, ['mood'], from, to, -1)
  push('behavioral', {
    id: 'mood',
    title: `Low mood (${r1(mo7)}/10)`,
    evidence: `Mood averaged ${r1(mo7)}/10 over ${span}; points are lost below 6.`,
    source: 'Modeled index: stress and sleep debt lower it.',
    points: Math.min(35, 8 * Math.max(0, 6 - mo7)),
    causes: mc,
    causeUnit: 'mood points',
    observed: observedLink(run, name, 'sleepDuration', 'less sleep', 'mood', 'mood', d, 1),
    recommendation: recommendFor(ctx, mc[0]?.effectId, 'mood'),
  })

  // ---- Muscle and bone
  const envs = Array.from({ length: to - from + 1 }, (_, k) => dayInputs(config, person, from + k).env)
  const envMean = (key: EnvKey) => envs.reduce((acc, e) => acc + e[key], 0) / envs.length
  const g = envMean('gravityG')
  const ex7 = m('exerciseMinutes')
  const exFrac = Math.min(1, ex7 / EXERCISE_DOSE_MIN)
  const end = result.days
  const exC = causesFor(run, ['exerciseMinutes'], from, to, -1)
  push('musculo', {
    id: 'exercise-dose',
    title: `Exercise below the countermeasure dose (${r0(ex7)} min/day)`,
    evidence: `${r0(ex7)} min a day logged over ${span}, ${Math.round(exFrac * 100)} % of the ${EXERCISE_DOSE_MIN} min/day the model treats as full protection, at ${g === 0 ? 'microgravity' : `${r1(g)} g`}.`,
    source: 'Loehr et al., Aerosp Med Hum Perform 86:A14 (2015) for ISS exercise; the 60 min/day dose is a model assumption.',
    points: g < 1 ? 25 * (1 - exFrac) * (1 - g) : 0,
    causes: exC,
    causeUnit: 'min/day below plan',
    observed: null,
    recommendation: exerciseRecommendation(ctx),
  })
  const st7 = m('muscleStrength')
  const stEnd = D.muscleStrength[end - 1]
  push('musculo', {
    id: 'strength',
    title: `Strength down ${r1(100 - st7)} % from pre-flight`,
    evidence: `Strength index ${r1(st7)} % of pre-flight over ${span}. If the plan continues unchanged the model projects ${r1(stEnd)} % on day ${end}. Points are lost beyond a 2 % loss.`,
    source: 'Trappe et al., J Appl Physiol 106:1159 (2009): calf strength fell despite exercise on 6-month ISS missions. Rate and equilibrium here are assumptions.',
    points: Math.min(50, 2.5 * Math.max(0, 100 - st7 - 2)),
    causes: causesFor(run, ['muscleStrength'], from, to, -1),
    causeUnit: '% strength',
    observed: null,
    recommendation: exerciseRecommendation(ctx),
  })
  const b7 = m('boneDensity')
  const bEnd = D.boneDensity[end - 1]
  push('musculo', {
    id: 'bone',
    title: `Bone indicator down ${(100 - b7).toFixed(2)} % from pre-flight`,
    evidence: `Bone indicator ${b7.toFixed(2)} % of pre-flight over ${span}; projected ${bEnd.toFixed(2)} % on day ${end} if the plan continues. Bone lost in flight recovers slowly, if at all, after return. Points are lost beyond 0.5 %.`,
    source: 'Stavnichuk et al., npj Microgravity 6:13 (2020): about 1 % a month at weight-bearing sites, less with resistive exercise. The model rate is an assumption.',
    points: Math.min(50, 12 * Math.max(0, 100 - b7 - 0.5)),
    causes: causesFor(run, ['boneDensity'], from, to, -1),
    causeUnit: '% bone',
    observed: null,
    recommendation: exerciseRecommendation(ctx),
  })

  // ---- Cardiopulmonary
  const b = person.baseline
  const hr7 = m('restingHR')
  const hrc = causesFor(run, ['restingHR'], from, to, 1)
  const hrDriver: [SimIndicator, string] = hrc[0]?.effectId === 'stress-cardio' ? ['mood', 'lower mood'] : ['sleepDuration', 'less sleep']
  push('cardio', {
    id: 'resting-hr',
    title: `Resting heart rate up ${r0(hr7 - b.restingHR)} bpm`,
    evidence: `7-day mean ${r0(hr7)} bpm against a ${b.restingHR} bpm pre-flight baseline (${span}); points are lost beyond +2 bpm.`,
    source: 'Personal baseline comparison. Drivers in the model: sleep debt, stress, deconditioning, low oxygen.',
    points: Math.min(40, 4 * Math.max(0, hr7 - b.restingHR - 2)),
    causes: hrc,
    causeUnit: 'bpm',
    observed: observedLink(run, name, hrDriver[0], hrDriver[1], 'restingHR', 'resting heart rate', d, 1),
    recommendation: recommendFor(ctx, hrc[0]?.effectId, 'heart rate'),
  })
  const hrv7 = m('hrv')
  const drop = ((b.hrv - hrv7) / b.hrv) * 100
  const hvc = causesFor(run, ['hrv'], from, to, -1)
  push('cardio', {
    id: 'hrv',
    title: `HRV down ${r0(drop)} %`,
    evidence: `7-day mean ${r0(hrv7)} ms against a ${b.hrv} ms pre-flight baseline (${span}); points are lost beyond an 8 % drop.`,
    source: 'Personal baseline comparison. Drivers in the model: sleep debt, stress, deconditioning.',
    points: Math.min(30, 1.2 * Math.max(0, drop - 8)),
    causes: hvc,
    causeUnit: 'ms',
    observed: null,
    recommendation: recommendFor(ctx, hvc[0]?.effectId, 'HRV'),
  })
  const sys7 = m('systolicBP')
  const dia7 = m('diastolicBP')
  const stage = sys7 >= 140 || dia7 >= 90 ? 2 : sys7 >= 130 || dia7 >= 80 ? 1 : 0
  push('cardio', {
    id: 'blood-pressure',
    title: `Blood pressure in stage ${stage} hypertension range (${r0(sys7)}/${r0(dia7)} mmHg)`,
    evidence: `7-day mean ${r0(sys7)}/${r0(dia7)} mmHg over ${span}. Stage 1 is 130–139 or 80–89 mmHg, stage 2 is ≥ 140 or ≥ 90 mmHg. In this model blood pressure follows the baseline you entered; nothing in the mission changes it.`,
    source: 'Whelton et al., 2017 ACC/AHA Hypertension Guideline (Hypertension 71:e13, 2018).',
    points: stage === 2 ? 25 : stage === 1 ? 10 : 0,
    causes: [],
    causeUnit: '',
    observed: null,
    recommendation: { key: 'bp', action: `Confirm ${name}'s blood pressure with repeated standardised measurements and review with the flight surgeon.`, why: 'A single elevated reading is not a diagnosis; repeated measurements are needed to stage blood pressure.' },
  })
  const o7 = m('spo2')
  const oc = causesFor(run, ['spo2'], from, to, -1)
  push('cardio', {
    id: 'spo2',
    title: `Low oxygen saturation (${r1(o7)} %)`,
    evidence: `SpO₂ averaged ${r1(o7)} % over ${span}; points are lost below 95 %.`,
    source: 'Alveolar gas equation and Severinghaus (1979) dissociation curve, from cabin pressure and oxygen partial pressure.',
    points: Math.min(40, 6 * Math.max(0, 95 - o7)),
    causes: oc,
    causeUnit: '% SpO₂',
    observed: null,
    recommendation: environmentRecommendation(ctx, 'ppO2KPa', 'oxygen saturation'),
  })

  // ---- Cabin and radiation exposure
  let envPoints = 0
  for (const p of ENV_PARAMS) {
    if (!p.reference) continue
    const v = envMean(p.key)
    const dir = outOfRange(p.key, v)
    if (!dir) continue
    const pts = Math.min(40 - envPoints, 10)
    envPoints += pts
    const ref = p.reference
    push('exposure', {
      id: `env-${p.key}`,
      title: `${p.label} ${dir === 'high' ? 'above' : 'below'} its reference range`,
      evidence: `Mean ${v.toFixed(p.decimals)} ${p.unit} over ${span}; reference ${ref.low ?? '—'}–${ref.high ?? '—'} ${p.unit}.`,
      source: ref.source,
      points: pts,
      causes: [],
      causeUnit: '',
      observed: null,
      recommendation: environmentRecommendation(ctx, p.key, 'cabin exposure'),
    })
  }
  let cum = 0
  for (let k = 0; k < d; k++) cum += D.radiationDose[k]
  let total = cum
  for (let k = d; k < end; k++) total += D.radiationDose[k]
  const pct = cum / CAREER_LIMIT_MSV
  const rc = causesFor(run, ['radiationDose'], 1, d, 1)
  push('exposure', {
    id: 'radiation',
    title: `Radiation dose ${r0(cum)} mSv (${r0(pct * 100)} % of the career limit)`,
    evidence: `${r1(cum)} mSv accumulated by day ${d}; projected ${r0(total)} mSv by day ${end} (${r0((total / CAREER_LIMIT_MSV) * 100)} % of the ${CAREER_LIMIT_MSV} mSv career limit). Points scale with the share of the limit used.${rc.length ? ` Of the dose above background, ${rc.map((c) => `${c.label.toLowerCase()} ${r0(c.share * 100)} %`).join(', ')}.` : ''}`,
    source: 'NASA-STD-3001 Vol. 1 Rev. B (2022): 600 mSv career effective-dose limit.',
    points: Math.min(60, 60 * pct),
    causes: rc,
    causeUnit: 'mSv/day above background',
    observed: null,
    recommendation: {
      key: 'radiation',
      action: rc.length ? `Plan EVAs outside solar-particle-event windows and keep ${name} in the storm shelter during events.` : `Background dose dominates for ${name}: only more shielding or a shorter mission reduces it. Track cumulative dose against the career limit.`,
      why: 'Dose cannot be undone; the limit applies over a whole career.',
    },
  })

  const domains: DomainResult[] = DOMAINS.map((x) => {
    const fs = found[x.id].sort((a, b) => b.points - a.points)
    const lost = fs.reduce((a, f) => a + f.points, 0)
    return { id: x.id, label: x.label, weight: x.weight, score: Math.max(0, Math.min(100, 100 - lost)), findings: fs }
  })
  const weighted = domains.reduce((a, x) => a + x.weight * x.score, 0)
  const weakest = Math.min(...domains.map((x) => x.score))
  const capped = weighted > weakest + WEAKEST_LINK_MARGIN
  const score = Math.round(capped ? weakest + WEAKEST_LINK_MARGIN : weighted)
  const findings = domains.flatMap((x) => x.findings).sort((a, b) => b.impact - a.impact)
  return { astronautId, name, day: d, from, to, score, weighted, capped, status: statusOf(score), domains, findings }
}

const cache = new Map<string, Assessment | null>()

/** Readiness of one astronaut on one mission day. */
export function assess(config: MissionConfig, result: SimulationResult, astronautId: string, day: number): Assessment | null {
  const key = `${result.fingerprint}|${astronautId}|${day}`
  if (cache.has(key)) return cache.get(key)!
  const core = assessCore(config, result, astronautId, day)
  let out: Assessment | null = null
  if (core) {
    const prev = core.day > 7 ? assessCore(config, result, astronautId, core.day - 7) : null
    out = { ...core, trend: prev ? core.score - prev.score : null }
  }
  if (cache.size > 4000) cache.clear()
  cache.set(key, out)
  return out
}

const seriesCache = new Map<string, number[]>()

/** Readiness score for every day of the mission (for trend charts). */
export function scoreSeries(config: MissionConfig, result: SimulationResult, astronautId: string): number[] {
  const key = `${result.fingerprint}|${astronautId}`
  const hit = seriesCache.get(key)
  if (hit) return hit
  const out: number[] = []
  for (let d = 1; d <= result.days; d++) out.push(assessCore(config, result, astronautId, d)?.score ?? 0)
  if (seriesCache.size > 64) seriesCache.clear()
  seriesCache.set(key, out)
  return out
}

// ------------------------------------------------------------------ what-if

export interface WhatIf {
  from: 'tomorrow' | 'start'
  compareDay: number
  before: number
  after: number
}

const whatIfRuns = new Map<string, SimulationResult | null>()

/** Re-run the simulation with a recommendation applied and compare readiness. */
export function testRecommendation(config: MissionConfig, result: SimulationResult, astronautId: string, day: number, rec: Recommendation): WhatIf | null {
  if (!rec.plan) return null
  const { config: changed, from } = rec.plan(structuredClone(config), day)
  // Simulate only this astronaut: the seed is per astronaut, so their run is otherwise identical.
  const solo: MissionConfig = { ...changed, crew: changed.crew.map((c) => ({ ...c, participates: c.id === astronautId })) }
  const key = fingerprint(solo)
  let r = whatIfRuns.get(key)
  if (r === undefined) {
    r = validateConfig(solo).some((i) => i.level === 'error') ? null : simulate(solo)
    if (whatIfRuns.size > 200) whatIfRuns.clear()
    whatIfRuns.set(key, r)
  }
  if (!r) return null
  const compareDay = from === 'start' ? day : result.days
  const before = assessCore(config, result, astronautId, compareDay)?.score
  const after = assessCore(solo, r, astronautId, compareDay)?.score
  if (before === undefined || after === undefined) return null
  return { from, compareDay, before, after }
}
