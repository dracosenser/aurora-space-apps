import type { RadiationScenario, ScenarioParams, ScenarioPoint, ScenarioResult } from '../types'
import { simulate } from '../sim/engine'
import { scoreSeries } from '../sim/assess'
import { blankMission, newAstronaut, newEvent } from '../sim/library'
import { SLEEP_MODEL } from '../sim/reference'
import type { MissionConfig, MissionEvent } from '../sim/types'

/**
 * Mission What-If Simulator.
 *
 * Each scenario is turned into a mission and run through the same simulation
 * engine and readiness model as the Mission Builder and the Medical Monitor, so
 * a score here means the same thing as a score anywhere else in AURORA. The
 * mapping from the five sliders to mission inputs is below and in
 * SIMULATOR_ASSUMPTIONS.
 */

export const DEFAULT_PARAMS: ScenarioParams = {
  durationDays: 900,
  sleepDisruption: 15,
  exerciseSessionsPerWeek: 6,
  radiationScenario: 'nominal',
  stressLevel: 4,
}

/** Longest mission the daily engine runs. */
export const MAX_SCENARIO_DAYS = 1100

export const RADIATION_SCENARIOS: Record<RadiationScenario, { label: string; blurb: string }> = {
  nominal: { label: 'Nominal (solar maximum)', blurb: 'GCR background near solar-maximum levels, no major solar particle events.' },
  'solar-minimum': { label: 'Solar minimum (+30% GCR)', blurb: 'Weaker heliospheric shielding raises galactic cosmic ray background.' },
  'spe-series': { label: 'Three solar particle events', blurb: 'Nominal GCR plus three SPEs (≈10, 25 and 8 mSv) with shelter protocol.' },
  'enhanced-shielding': { label: 'Enhanced shielding (−30%)', blurb: 'Water-wall and regolith shielding reduce effective dose.' },
}

/** Transit and surface background dose, mSv/day (MSL/RAD: Zeitlin et al. 2013; Hassler et al. 2014). */
const TRANSIT_MSV = 1.8
const SURFACE_MSV = 0.48
const RAD_FACTOR: Record<RadiationScenario, number> = { nominal: 1, 'solar-minimum': 1.3, 'spe-series': 1, 'enhanced-shielding': 0.7 }
/** A sleep period long enough to cover an 8 h need at 90 % efficiency. */
const PROTECTED_SLEEP_H = 9
/** Sleep period lost at 100 % disruption. */
const MAX_DISRUPTION_H = 3
/** Minutes per session, so 6 sessions a week is the 60 min/day countermeasure dose. */
const SESSION_MIN = 70
const BASE_WORKLOAD = 2

export function phaseDays(durationDays: number): { landing: number; departure: number } {
  return { landing: Math.round(durationDays * 0.23) + 1, departure: Math.round(durationDays * 0.79) + 1 }
}

/** The mission a scenario describes: one reference crew member, transit / Mars surface / transit. */
export function scenarioMission(p: ScenarioParams): MissionConfig {
  const days = Math.max(30, Math.min(MAX_SCENARIO_DAYS, Math.round(p.durationDays)))
  const m = blankMission()
  m.id = 'WHATIF'
  m.name = 'What-If scenario'
  m.destination = 'Mars'
  m.seed = 2026
  m.durationDays = days
  m.resolution = 'daily'
  const f = RAD_FACTOR[p.radiationScenario]
  m.environment = { ...m.environment, gravityG: 0, radiationMSvPerDay: TRANSIT_MSV * f }
  const crewStress = 1 + 0.6 * BASE_WORKLOAD
  m.crew = [
    newAstronaut(0, {
      id: 'REF',
      name: 'Reference crew member',
      role: 'Reference',
      schedule: {
        sleepStartHour: 22,
        sleepHours: PROTECTED_SLEEP_H - (MAX_DISRUPTION_H * p.sleepDisruption) / 100,
        workHours: 9,
        exerciseSessionsPerWeek: p.exerciseSessionsPerWeek,
        exerciseMinutes: SESSION_MIN,
        exerciseHour: 16,
        workload: BASE_WORKLOAD,
      },
      baseline: { restingHR: 60, hrv: 60, respRate: 14, spo2: 98, bodyTemp: 36.7, sleepNeed: SLEEP_MODEL.defaultNeedH, sleepRequirement: SLEEP_MODEL.defaultNeedH, activityMinutes: 140, variability: 0.2, systolicBP: 118, diastolicBP: 76 },
    }),
  ]
  const { landing, departure } = phaseDays(days)
  const fixed = (e: MissionEvent, id: string): MissionEvent => ({ ...e, id })
  const events: MissionEvent[] = [
    fixed(newEvent('custom', landing, departure - landing, 'Mars surface stay', { envOverride: { gravityG: 0.38, radiationMSvPerDay: SURFACE_MSV * f }, params: {} }), 'EV-SURFACE'),
  ]
  const extraStress = Math.max(0, p.stressLevel - crewStress)
  if (extraStress > 0) events.push(fixed(newEvent('stress', 1, days, 'Mission stress', { params: { stressIncrease: Math.min(5, extraStress) } }), 'EV-STRESS'))
  if (p.radiationScenario === 'spe-series') {
    ;([[0.15, 10], [0.5, 25], [0.8, 8]] as const).forEach(([frac, dose], k) =>
      events.push(fixed(newEvent('solar-particle-event', Math.max(1, Math.round(frac * days)), 2, `Solar particle event ${k + 1}`, { params: { doseMSv: dose, sleepLossHours: 2, stressIncrease: 1 } }), `EV-SPE-${k}`)),
    )
  }
  m.events = events
  return m
}

const cache = new Map<string, ScenarioResult>()

export function runScenario(params: ScenarioParams): ScenarioResult {
  const key = JSON.stringify(params)
  const hit = cache.get(key)
  if (hit) return hit
  const config = scenarioMission(params)
  const result = simulate(config)
  const run = result.astronauts[0]
  const D = run.daily
  const readiness = scoreSeries(config, result, run.astronautId)
  const series: ScenarioPoint[] = []
  const stride = Math.max(1, Math.round(result.days / 300))
  let cumulative = 0
  // A 7-day mean, so the chart shows the trend the readiness model scores rather than daily noise.
  const mean7 = (arr: ArrayLike<number>, i: number) => {
    let s = 0
    const from = Math.max(0, i - 6)
    for (let k = from; k <= i; k++) s += arr[k]
    return s / (i - from + 1)
  }
  for (let i = 0; i < result.days; i++) {
    cumulative += D.radiationDose[i]
    const day = i + 1
    if (day % stride !== 0 && day !== 1 && day !== result.days) continue
    series.push({
      day,
      muscleStrength: round(mean7(D.muscleStrength, i), 1),
      boneDensity: round(mean7(D.boneDensity, i), 2),
      sleepQuality: round(mean7(D.sleepQuality, i), 1),
      restingHR: round(mean7(D.restingHR, i), 1),
      fatigue: round(mean7(D.fatigue, i), 1),
      sleepDebt: round(D.sleepDebt[i], 1),
      radiationCumulative: round(cumulative, 1),
      readiness: readiness[i],
    })
  }
  const out = { params: { ...params, durationDays: result.days }, series, final: series[series.length - 1] }
  if (cache.size > 40) cache.clear()
  cache.set(key, out)
  return out
}

function round(v: number, d: number): number {
  const f = Math.pow(10, d)
  return Math.round(v * f) / f
}

export function baselineFor(params: ScenarioParams): ScenarioResult {
  return runScenario({ ...DEFAULT_PARAMS, durationDays: params.durationDays })
}

export function describeScenario(p: ScenarioParams): string[] {
  const out: string[] = []
  const { landing, departure } = phaseDays(p.durationDays)
  out.push(
    `A ${p.durationDays}-day Mars mission for one reference crew member: days 1–${landing - 1} outbound in microgravity, days ${landing}–${departure - 1} on the surface at 0.38 g, days ${departure}–${p.durationDays} returning in microgravity.`,
  )
  const perDay = (p.exerciseSessionsPerWeek * SESSION_MIN) / 7
  out.push(
    p.exerciseSessionsPerWeek >= 6
      ? `Exercise: ${p.exerciseSessionsPerWeek} × ${SESSION_MIN} min a week (${Math.round(perDay)} min/day), at or above the 60 min/day countermeasure dose, so muscle and bone loss are slowed but not stopped in microgravity.`
      : `Exercise: ${p.exerciseSessionsPerWeek} × ${SESSION_MIN} min a week (${Math.round(perDay)} min/day), ${Math.round((perDay / 60) * 100)} % of the 60 min/day countermeasure dose. Deconditioning in microgravity proceeds faster in proportion.`,
  )
  const sleepH = PROTECTED_SLEEP_H - (MAX_DISRUPTION_H * p.sleepDisruption) / 100
  const slept = sleepH * SLEEP_MODEL.efficiency
  out.push(
    `Sleep: ${p.sleepDisruption} % disruption leaves a ${sleepH.toFixed(2)} h sleep period, about ${slept.toFixed(1)} h of sleep against an ${SLEEP_MODEL.defaultNeedH} h need. ${slept < SLEEP_MODEL.defaultNeedH - 0.05 ? `The ${(SLEEP_MODEL.defaultNeedH - slept).toFixed(1)} h nightly shortfall accumulates as sleep debt (Van Dongen 2003), which drives reaction-time lapses, fatigue, heart rate and mood.` : 'That covers the need, so no sleep debt builds.'}`,
  )
  out.push(RADIATION_SCENARIOS[p.radiationScenario].blurb + ` Background ${(TRANSIT_MSV * RAD_FACTOR[p.radiationScenario]).toFixed(2)} mSv/day in transit and ${(SURFACE_MSV * RAD_FACTOR[p.radiationScenario]).toFixed(2)} mSv/day on the surface.`)
  const crewStress = 1 + 0.6 * BASE_WORKLOAD
  out.push(p.stressLevel <= crewStress ? `Stress ${p.stressLevel}/10 is within what a routine workload produces in the model.` : `Stress ${p.stressLevel}/10 adds ${Math.min(5, p.stressLevel - crewStress).toFixed(1)} points to the model's stress for the whole mission, which raises heart rate and fatigue and lowers sleep quality and mood.`)
  return out
}

export function operationalConsiderations(result: ScenarioResult, baseline: ScenarioResult): string[] {
  const out: string[] = []
  const f = result.final
  const b = baseline.final
  if (f.radiationCumulative >= 600) out.push(`Projected cumulative dose (${f.radiationCumulative.toFixed(0)} mSv) exceeds the 600 mSv career effective-dose limit in NASA-STD-3001. Shielding, mission duration or transit timing would need to change.`)
  else if (f.radiationCumulative >= 450) out.push(`Projected cumulative dose (${f.radiationCumulative.toFixed(0)} mSv) consumes most of the 600 mSv career limit in NASA-STD-3001, limiting future flight assignments.`)
  if (f.sleepDebt >= 15) out.push(`Sleep debt ends at ${f.sleepDebt.toFixed(0)} h, about ${(f.sleepDebt / SLEEP_MODEL.nightEquivalentH).toFixed(1)} nights without sleep in performance terms. Protect the sleep period before anything else: debt keeps building as long as the nightly shortfall does.`)
  if (f.muscleStrength < 85) out.push(`Muscle strength index falls below 85% of pre-flight, which would challenge EVA workload and emergency egress capability on landing.`)
  if (f.boneDensity < 94) out.push(`Bone indicator falls to ${f.boneDensity.toFixed(1)}% of pre-flight; recovery after return is slow and fracture-risk review would be warranted.`)
  if (f.fatigue >= 6) out.push(`Sustained fatigue above 6/10 would argue for schedule protection, task re-sequencing and sleep countermeasures.`)
  if (f.readiness < 65) out.push(`Readiness ends at ${f.readiness.toFixed(0)}/100, in caution. The Medical Monitor would flag this crew member for attention.`)
  if (f.readiness < b.readiness - 10) out.push(`Readiness ends ${(b.readiness - f.readiness).toFixed(0)} points below the baseline plan; the mission would carry reduced margin for contingency operations.`)
  if (out.length === 0) out.push('No modelled indicator crosses an operational threshold. Margins are similar to the baseline scenario.')
  return out
}

export const SIMULATOR_ASSUMPTIONS: string[] = [
  'Each scenario is run through the same engine and readiness model as the Mission Builder and Medical Monitor, for one reference crew member with steady day-to-day variation.',
  `Sleep disruption shortens the sleep period from ${PROTECTED_SLEEP_H} h (enough for an 8 h need) by up to ${MAX_DISRUPTION_H} h. Shortfalls accumulate as sleep debt with a ${SLEEP_MODEL.decayDays}-day recovery time constant (Van Dongen et al., 2003).`,
  `Exercise sessions are ${SESSION_MIN} min, so 6 a week is the 60 min/day dose the model treats as full protection. Muscle and bone follow the engine's deconditioning model; bone does not recover in flight.`,
  'Radiation uses MSL/RAD-informed background rates (≈1.8 mSv/day in transit, ≈0.5 mSv/day in a shielded surface habitat) and discrete SPE doses with time in the storm shelter.',
  'Stress above what a routine workload produces is added for the whole mission; it raises heart rate and fatigue and lowers sleep quality and mood.',
  'Readiness is AURORA’s operational score (sleep and alertness, behavioral health, muscle and bone, cardiopulmonary, exposure), including radiation against the 600 mSv career limit. It is not a clinical instrument.',
  'Individual variability, countermeasure pharmacology, nutrition, illness, and crew interactions are not modelled. Outputs are illustrative and must not inform real medical decisions.',
]
