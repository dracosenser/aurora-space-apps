import type { Alert, AlertSeverity, AlertStat, Astronaut, DailyRecord, IndicatorKey } from '../types'
import { INDICATORS, formatIndicator } from './indicators'
import { clamp, mean, median, slope, std } from './stats'

/**
 * Explainable anomaly detection.
 *
 * AURORA deliberately uses transparent statistics (rolling baselines,
 * z-scores, trend slopes and rule combinations) instead of an opaque model.
 * Every alert carries the numbers that triggered it, the rule that fired,
 * and a confidence rationale. An anomaly is a statistical deviation in the
 * data, NOT a medical diagnosis.
 */

type Series = Record<IndicatorKey, number[]>

interface Hit {
  severity: AlertSeverity
  indicators: IndicatorKey[]
  stats: AlertStat[]
  extra: Record<string, number>
}

interface Described {
  title: string
  whatChanged: string
  why: string
  review: string[]
  confidence: number
  confidenceRationale: string
}

interface RuleDef {
  id: string
  name: string
  method: string
  evaluate: (s: Series, d: number, astro: Astronaut) => Hit | null
  describe: (hit: Hit, astro: Astronaut, startDay: number, endDay: number) => Described
}

const BASE_DAYS = 30
const GAP_DAYS = 7
const RECENT_DAYS = 7

/** Baseline window: 30 days ending 7 days before the recent window (so the shift itself does not pollute the baseline). */
function baselineWindow(arr: number[], d: number): number[] {
  const end = d - RECENT_DAYS - GAP_DAYS // index exclusive
  const start = Math.max(0, end - BASE_DAYS)
  return arr.slice(start, end)
}

function recentWindow(arr: number[], d: number, n = RECENT_DAYS): number[] {
  return arr.slice(Math.max(0, d - n), d)
}

function statFor(s: Series, key: IndicatorKey, d: number, n = RECENT_DAYS): AlertStat {
  const base = baselineWindow(s[key], d)
  const recent = recentWindow(s[key], d, n)
  const sd = std(base)
  const bm = mean(base)
  const rm = mean(recent)
  const z = sd < 1e-6 ? 0 : (rm - bm) / sd
  return { indicator: key, baseline: bm, recent: rm, z }
}

/** Positive when the change is in the "worse" direction for that indicator. */
function worseZ(stat: AlertStat): number {
  const meta = INDICATORS[stat.indicator]
  if (meta.worseWhen === 'higher') return stat.z
  if (meta.worseWhen === 'lower') return -stat.z
  return Math.abs(stat.z)
}

function dir(stat: AlertStat): string {
  return stat.recent > stat.baseline ? 'rose' : 'fell'
}

function describeStat(stat: AlertStat): string {
  const m = INDICATORS[stat.indicator]
  return `${m.label} ${dir(stat)} from ${formatIndicator(stat.indicator, stat.baseline)} (30-day baseline) to ${formatIndicator(stat.indicator, stat.recent)} (7-day mean), z = ${stat.z.toFixed(1)}`
}

function persistenceBoost(startDay: number, endDay: number): number {
  const days = endDay - startDay + 1
  return clamp((days - 1) * 0.02, 0, 0.14)
}

function confidenceText(conf: number, parts: string[]): string {
  const level = conf >= 0.8 ? 'high' : conf >= 0.6 ? 'moderate' : 'low-to-moderate'
  return `${level.charAt(0).toUpperCase() + level.slice(1)} confidence (${Math.round(conf * 100)}%). ${parts.join(' ')}`
}

const RULES: RuleDef[] = [
  {
    id: 'cardio-shift',
    name: 'Cardiovascular level shift',
    method: '7-day mean vs 30-day rolling baseline, z-score threshold ≥ 2.2 (resting HR up and/or HRV down), persisting ≥ 2 days',
    evaluate: (s, d) => {
      const hr = statFor(s, 'restingHR', d)
      const hrv = statFor(s, 'hrv', d)
      const hits: AlertStat[] = []
      if (worseZ(hr) >= 2.2) hits.push(hr)
      if (worseZ(hrv) >= 2.2) hits.push(hrv)
      if (hits.length === 0) return null
      const peak = Math.max(...hits.map(worseZ))
      return {
        severity: hits.length === 2 && peak >= 2.5 ? 'caution' : 'watch',
        indicators: hits.map((h) => h.indicator),
        stats: [hr, hrv],
        extra: { peak },
      }
    },
    describe: (hit, astro, startDay, endDay) => {
      const conf = clamp(0.5 + 0.1 * (hit.extra.peak - 2) + (hit.indicators.length === 2 ? 0.1 : 0) + persistenceBoost(startDay, endDay), 0.4, 0.93)
      return {
        title: `${astro.callsign}: resting cardiovascular indicators shifted`,
        whatChanged: hit.stats.filter((st) => hit.indicators.includes(st.indicator)).map(describeStat).join('. ') + '.',
        why: `The 7-day mean moved more than two baseline standard deviations away from this crew member's own 30-day history. Both resting heart rate and HRV are influenced by sleep, workload, hydration, illness and deconditioning, so the rule flags the shift for review rather than attributing a cause.`,
        review: [
          'Recent sleep duration and quality for the same window',
          'Exercise log: missed or reduced countermeasure sessions',
          'Hydration, caffeine and medication logs',
          'Any reported symptoms at the next private medical conference',
        ],
        confidence: conf,
        confidenceRationale: confidenceText(conf, [
          `Peak deviation ${hit.extra.peak.toFixed(1)} σ.`,
          hit.indicators.length === 2 ? 'Two independent cardiovascular indicators moved in the concerning direction.' : 'A single indicator moved; the companion indicator stayed within baseline.',
          `Persisted ${endDay - startDay + 1} day(s).`,
        ]),
      }
    },
  },
  {
    id: 'sleep-irregular',
    name: 'Sleep irregularity',
    method: '7-day standard deviation of sleep duration ≥ 1.1 h, or consistency score ≥ 18 points below baseline',
    evaluate: (s, d) => {
      const recentDur = recentWindow(s.sleepDuration, d)
      const sdDur = std(recentDur)
      const cons = statFor(s, 'sleepConsistency', d)
      const dur = statFor(s, 'sleepDuration', d)
      const irregular = sdDur >= 1.1
      const lowCons = cons.baseline - cons.recent >= 18
      if (!irregular && !lowCons) return null
      return {
        severity: irregular && lowCons && dur.recent < 6 ? 'caution' : 'watch',
        indicators: ['sleepDuration', 'sleepConsistency'],
        stats: [dur, cons],
        extra: { sdDur, drop: cons.baseline - cons.recent },
      }
    },
    describe: (hit, astro, startDay, endDay) => {
      const conf = clamp(0.5 + Math.min(0.2, (hit.extra.sdDur - 1.1) * 0.3) + Math.min(0.15, hit.extra.drop / 150) + persistenceBoost(startDay, endDay), 0.4, 0.92)
      const [dur, cons] = hit.stats
      return {
        title: `${astro.callsign}: several days of irregular sleep`,
        whatChanged: `Night-to-night sleep duration varied with a standard deviation of ${hit.extra.sdDur.toFixed(1)} h over the last 7 days (mean ${dur.recent.toFixed(1)} h vs ${dur.baseline.toFixed(1)} h baseline). Sleep consistency score fell ${hit.extra.drop.toFixed(0)} points to ${cons.recent.toFixed(0)}/100.`,
        why: `Spaceflight sleep is often short, but a sudden increase in night-to-night variability is a distinct signal that usually traces to schedule disruption (shift work, repairs, EVA timing). The rule combines a variability test with the consistency score so a single bad night does not trigger it.`,
        review: [
          'Crew timeline: night shifts, repairs or EVA preparation in this window',
          'Caffeine and light-exposure schedule',
          'Fatigue and reaction-time trend over the same days',
          'Whether the schedule has already returned to nominal',
        ],
        confidence: conf,
        confidenceRationale: confidenceText(conf, [
          `Duration variability ${hit.extra.sdDur.toFixed(1)} h (threshold 1.1 h).`,
          `Consistency drop ${hit.extra.drop.toFixed(0)} points.`,
          `Persisted ${endDay - startDay + 1} day(s).`,
        ]),
      }
    },
  },
  {
    id: 'fatigue-exercise',
    name: 'Rising fatigue with declining exercise',
    method: '10-day fatigue trend ≥ +1.0 point (or 7-day mean ≥ baseline + 1.2) combined with exercise ≤ 78% of baseline',
    evaluate: (s, d) => {
      const fat = statFor(s, 'fatigue', d)
      const fatTrend = slope(recentWindow(s.fatigue, d, 10)) * 10
      const ex = statFor(s, 'exerciseMinutes', d, 10)
      const fatigueUp = fatTrend >= 1.0 || fat.recent - fat.baseline >= 1.2
      const exerciseDown = ex.baseline > 0 && ex.recent / ex.baseline <= 0.78
      if (!fatigueUp || !exerciseDown) return null
      return {
        severity: 'caution',
        indicators: ['fatigue', 'exerciseMinutes'],
        stats: [fat, ex],
        extra: { fatTrend, exRatio: ex.recent / ex.baseline },
      }
    },
    describe: (hit, astro, startDay, endDay) => {
      const conf = clamp(0.6 + Math.min(0.15, (1 - hit.extra.exRatio) * 0.5) + Math.min(0.1, hit.extra.fatTrend * 0.05) + persistenceBoost(startDay, endDay), 0.45, 0.94)
      const [fat, ex] = hit.stats
      return {
        title: `${astro.callsign}: fatigue rising while exercise declines`,
        whatChanged: `Fatigue trended +${hit.extra.fatTrend.toFixed(1)} points over 10 days (7-day mean ${fat.recent.toFixed(1)}/10 vs ${fat.baseline.toFixed(1)} baseline) while logged exercise fell to ${Math.round(hit.extra.exRatio * 100)}% of baseline (${ex.recent.toFixed(0)} vs ${ex.baseline.toFixed(0)} min/day).`,
        why: `Either indicator alone is common on a long mission. The combination matters because exercise is the primary countermeasure against deconditioning, and reduced exercise with rising fatigue can reinforce each other. The rule requires both conditions in the same window.`,
        review: [
          'Exercise hardware status and schedule conflicts',
          'Workload in the crew timeline (science campaigns, repairs)',
          'Sleep duration and quality trends',
          'Cardiovascular indicators for an accompanying shift',
        ],
        confidence: conf,
        confidenceRationale: confidenceText(conf, [
          `Two conditions met simultaneously.`,
          `Exercise at ${Math.round(hit.extra.exRatio * 100)}% of baseline.`,
          `Persisted ${endDay - startDay + 1} day(s).`,
        ]),
      }
    },
  },
  {
    id: 'multi-indicator',
    name: 'Multiple indicators changing together',
    method: 'Three or more of eight core indicators each ≥ 1.5 σ from baseline in the concerning direction',
    evaluate: (s, d) => {
      const keys: IndicatorKey[] = ['restingHR', 'hrv', 'sleepDuration', 'sleepQuality', 'exerciseMinutes', 'fatigue', 'mood', 'stress']
      const stats = keys.map((k) => statFor(s, k, d))
      const flagged = stats.filter((st) => worseZ(st) >= 1.5)
      if (flagged.length < 3) return null
      return {
        severity: 'caution',
        indicators: flagged.map((f) => f.indicator),
        stats,
        extra: { count: flagged.length, meanZ: mean(flagged.map(worseZ)) },
      }
    },
    describe: (hit, astro, startDay, endDay) => {
      const conf = clamp(0.55 + (hit.extra.count - 3) * 0.08 + Math.min(0.12, (hit.extra.meanZ - 1.5) * 0.1) + persistenceBoost(startDay, endDay), 0.45, 0.95)
      const flagged = hit.stats.filter((st) => hit.indicators.includes(st.indicator))
      return {
        title: `${astro.callsign}: ${hit.extra.count} indicators moved together`,
        whatChanged: flagged.map(describeStat).join('. ') + '.',
        why: `Independent indicators rarely drift in the concerning direction at the same time by chance. A coordinated shift across ${hit.extra.count} of 8 core indicators suggests a common driver (workload, schedule, environment or health) and is the strongest signal AURORA raises. It is still a statistical pattern, not a diagnosis.`,
        review: [
          'Review each flagged indicator individually in Crew Health Analytics',
          'Correlate with mission events in the same window',
          'Compare with the rest of the crew to separate individual from crew-wide drivers',
          'Flag for the flight surgeon at the next medical conference',
        ],
        confidence: conf,
        confidenceRationale: confidenceText(conf, [
          `${hit.extra.count} independent indicators flagged (mean deviation ${hit.extra.meanZ.toFixed(1)} σ).`,
          `Persisted ${endDay - startDay + 1} day(s).`,
        ]),
      }
    },
  },
  {
    id: 'behavioral-shift',
    name: 'Stress and mood shift',
    method: '7-day mean stress ≥ baseline + 1.8 and mood ≤ baseline − 1.3',
    evaluate: (s, d) => {
      const stress = statFor(s, 'stress', d)
      const mood = statFor(s, 'mood', d)
      if (stress.recent - stress.baseline < 1.8 || mood.baseline - mood.recent < 1.3) return null
      return {
        severity: stress.recent >= 7 ? 'caution' : 'watch',
        indicators: ['stress', 'mood'],
        stats: [stress, mood],
        extra: { stressDelta: stress.recent - stress.baseline, moodDelta: mood.baseline - mood.recent },
      }
    },
    describe: (hit, astro, startDay, endDay) => {
      const conf = clamp(0.5 + Math.min(0.2, hit.extra.stressDelta * 0.06) + Math.min(0.1, hit.extra.moodDelta * 0.05) + persistenceBoost(startDay, endDay), 0.4, 0.9)
      const [stress, mood] = hit.stats
      return {
        title: `${astro.callsign}: self-reported stress up, mood down`,
        whatChanged: `Stress check-ins averaged ${stress.recent.toFixed(1)}/10 over 7 days (baseline ${stress.baseline.toFixed(1)}); mood averaged ${mood.recent.toFixed(1)}/10 (baseline ${mood.baseline.toFixed(1)}).`,
        why: `Self-reports are subjective but they are the crew's own voice. The rule looks for a concurrent move in two separate questions so that a single difficult day does not trigger an alert. Communication constraints, isolation and workload are documented behavioral-health stressors in long-duration missions.`,
        review: [
          'Mission events: communication constraints, confinement, schedule pressure',
          'Sleep quality trend over the same window',
          'Crew-wide comparison to distinguish individual from shared stressors',
          'Behavioral health conference availability',
        ],
        confidence: conf,
        confidenceRationale: confidenceText(conf, [
          `Stress +${hit.extra.stressDelta.toFixed(1)} and mood −${hit.extra.moodDelta.toFixed(1)} points vs baseline.`,
          'Based on self-report, which is informative but subjective.',
          `Persisted ${endDay - startDay + 1} day(s).`,
        ]),
      }
    },
  },
  {
    id: 'bp-trend',
    name: 'Blood pressure research trend',
    method: '28-day linear trend of systolic BP ≥ +4.5 mmHg with 7-day mean ≥ baseline + 3.5 mmHg',
    evaluate: (s, d) => {
      const trend = slope(recentWindow(s.systolicBP, d, 28)) * 28
      const sys = statFor(s, 'systolicBP', d)
      if (trend < 4.5 || sys.recent - sys.baseline < 3.5) return null
      return { severity: 'info', indicators: ['systolicBP', 'diastolicBP'], stats: [sys, statFor(s, 'diastolicBP', d)], extra: { trend } }
    },
    describe: (hit, astro, startDay, endDay) => {
      const conf = clamp(0.4 + Math.min(0.2, (hit.extra.trend - 4) * 0.04) + persistenceBoost(startDay, endDay), 0.35, 0.8)
      const [sys] = hit.stats
      return {
        title: `${astro.callsign}: gradual upward blood-pressure trend`,
        whatChanged: `Systolic BP trended +${hit.extra.trend.toFixed(1)} mmHg over 28 days (7-day mean ${sys.recent.toFixed(0)} mmHg vs ${sys.baseline.toFixed(0)} baseline).`,
        why: `Blood pressure here is a weekly measurement interpolated for display, so this is a slow research-indicator trend rather than a clinical finding. Fluid shifts, salt intake and activity all influence it. Flagged at informational level only.`,
        review: ['Confirm with a dedicated measurement protocol', 'Dietary sodium and fluid-loading logs', 'Exercise and body-mass trends'],
        confidence: conf,
        confidenceRationale: confidenceText(conf, ['Weekly measurement cadence limits resolution.', `Trend +${hit.extra.trend.toFixed(1)} mmHg / 28 d.`]),
      }
    },
  },
]

interface OpenAlert {
  rule: RuleDef
  hit: Hit
  startDay: number
  endDay: number
}

function seriesFor(records: DailyRecord[]): Series {
  const keys = Object.keys(INDICATORS) as IndicatorKey[]
  const s = {} as Series
  for (const k of keys) s[k] = records.map((r) => r[k])
  return s
}

function finalize(open: OpenAlert, astro: Astronaut, asOfDay: number): Alert {
  const desc = open.rule.describe(open.hit, astro, open.startDay, open.endDay)
  return {
    id: `${open.rule.id}-${astro.id}-${open.startDay}`,
    ruleId: open.rule.id,
    ruleName: open.rule.name,
    title: desc.title,
    astronautIds: [astro.id],
    startDay: open.startDay,
    endDay: open.endDay,
    active: open.endDay >= asOfDay - 2,
    severity: open.hit.severity,
    indicators: open.hit.indicators,
    whatChanged: desc.whatChanged,
    why: desc.why,
    method: open.rule.method,
    confidence: desc.confidence,
    confidenceRationale: desc.confidenceRationale,
    review: desc.review,
    stats: open.hit.stats,
  }
}

function detectForAstronaut(records: DailyRecord[], astro: Astronaut, asOfDay: number): Alert[] {
  const sorted = records.filter((r) => r.astronautId === astro.id && r.day <= asOfDay).sort((a, b) => a.day - b.day)
  const s = seriesFor(sorted)
  const alerts: Alert[] = []
  const open = new Map<string, OpenAlert>()
  const lastHit = new Map<string, number>()
  const minDay = BASE_DAYS + GAP_DAYS + RECENT_DAYS + 1

  for (let d = minDay; d <= sorted.length; d++) {
    for (const rule of RULES) {
      const hit = rule.evaluate(s, d, astro)
      const current = open.get(rule.id)
      if (hit) {
        lastHit.set(rule.id, d)
        if (current) {
          current.endDay = d
          // Keep the most severe / most informative hit.
          if (hit.indicators.length >= current.hit.indicators.length) current.hit = hit
        } else {
          open.set(rule.id, { rule, hit, startDay: d, endDay: d })
        }
      } else if (current && d - (lastHit.get(rule.id) ?? d) >= 5) {
        // Require at least two consecutive days so single-day noise is not reported.
        if (current.endDay - current.startDay >= 1) alerts.push(finalize(current, astro, asOfDay))
        open.delete(rule.id)
      }
    }
  }
  for (const current of open.values()) {
    if (current.endDay - current.startDay >= 1 || current.endDay >= asOfDay - 1) alerts.push(finalize(current, astro, asOfDay))
  }
  return alerts
}

function detectRadiationEvents(records: DailyRecord[], astronauts: Astronaut[], asOfDay: number): Alert[] {
  const byDay = new Map<number, number[]>()
  for (const r of records) {
    if (r.day > asOfDay) continue
    const arr = byDay.get(r.day) ?? []
    arr.push(r.radiationDaily)
    byDay.set(r.day, arr)
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const crewMean = days.map((d) => mean(byDay.get(d)!))
  const alerts: Alert[] = []
  let i = 0
  while (i < days.length) {
    if (i < 10) {
      i++
      continue
    }
    const prior = crewMean.slice(Math.max(0, i - 30), i)
    const med = median(prior)
    if (crewMean[i] > 3 * med) {
      const start = i
      let total = 0
      while (i < days.length && crewMean[i] > 1.8 * med) {
        total += crewMean[i] - med
        i++
      }
      const end = i - 1
      const severity: AlertSeverity = total >= 5 ? 'caution' : 'watch'
      const conf = clamp(0.75 + Math.min(0.2, total / 40), 0.7, 0.96)
      alerts.push({
        id: `radiation-event-${days[start]}`,
        ruleId: 'radiation-event',
        ruleName: 'Radiation exposure event',
        title: `Crew-wide radiation event: +${total.toFixed(1)} mSv above background`,
        astronautIds: astronauts.map((a) => a.id),
        startDay: days[start],
        endDay: days[end],
        active: days[end] >= asOfDay - 2,
        severity,
        indicators: ['radiationDaily', 'radiationCumulative'],
        whatChanged: `Crew-mean daily dose peaked at ${Math.max(...crewMean.slice(start, end + 1)).toFixed(2)} mSv against a 30-day median of ${med.toFixed(2)} mSv/day (${(Math.max(...crewMean.slice(start, end + 1)) / med).toFixed(0)}× background). Excess dose over ${end - start + 1} day(s): ${total.toFixed(1)} mSv for each crew member.`,
        why: `Daily dose exceeded three times the trailing 30-day median, the signature of a solar particle event rather than normal galactic cosmic ray background. Dosimetry is a direct physical measurement, so confidence is high; the health significance of any single event is assessed against cumulative career exposure, not in isolation.`,
        method: 'Crew-mean daily dose > 3× trailing 30-day median; event continues while dose > 1.8× median',
        confidence: conf,
        confidenceRationale: confidenceText(conf, ['Physical dosimeter measurement with low noise.', `Excess ${total.toFixed(1)} mSv over ${end - start + 1} day(s).`]),
        review: [
          'Shelter protocol timing versus the dose profile',
          'Updated cumulative dose against mission and career exposure limits',
          'Space-weather forecast for follow-on activity',
          'EVA scheduling constraints for the coming days',
        ],
        stats: [{ indicator: 'radiationDaily', baseline: med, recent: Math.max(...crewMean.slice(start, end + 1)), z: 0 }],
      })
    } else {
      i++
    }
  }
  return alerts
}

export function detectAnomalies(records: DailyRecord[], astronauts: Astronaut[], asOfDay: number): Alert[] {
  const alerts: Alert[] = []
  for (const a of astronauts) alerts.push(...detectForAstronaut(records, a, asOfDay))
  alerts.push(...detectRadiationEvents(records, astronauts, asOfDay))
  const sevRank: Record<AlertSeverity, number> = { caution: 0, watch: 1, info: 2 }
  return alerts.sort((x, y) => {
    if (x.active !== y.active) return x.active ? -1 : 1
    if (x.active) {
      if (sevRank[x.severity] !== sevRank[y.severity]) return sevRank[x.severity] - sevRank[y.severity]
      return y.confidence - x.confidence
    }
    if (x.endDay !== y.endDay) return y.endDay - x.endDay
    return sevRank[x.severity] - sevRank[y.severity]
  })
}

export const RULE_CATALOG = RULES.map((r) => ({ id: r.id, name: r.name, method: r.method })).concat([
  { id: 'radiation-event', name: 'Radiation exposure event', method: 'Crew-mean daily dose > 3× trailing 30-day median' },
])
