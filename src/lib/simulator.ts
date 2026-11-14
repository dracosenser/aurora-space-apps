import type { RadiationScenario, ScenarioParams, ScenarioPoint, ScenarioResult } from '../types'
import { clamp } from './stats'

/**
 * Mission What-If Simulator.
 *
 * An ILLUSTRATIVE scenario model. The equations below are simple
 * first-order responses whose magnitudes are informed by published
 * spaceflight findings (see docs/METHODOLOGY.md). They are not validated
 * medical predictions and must not be read as such.
 */

export const DEFAULT_PARAMS: ScenarioParams = {
  durationDays: 900,
  sleepDisruption: 15,
  exerciseSessionsPerWeek: 6,
  radiationScenario: 'nominal',
  stressLevel: 4,
}

export const RADIATION_SCENARIOS: Record<RadiationScenario, { label: string; blurb: string }> = {
  nominal: { label: 'Nominal (solar maximum)', blurb: 'GCR background near solar-maximum levels, no major solar particle events.' },
  'solar-minimum': { label: 'Solar minimum (+30% GCR)', blurb: 'Weaker heliospheric shielding raises galactic cosmic ray background.' },
  'spe-series': { label: 'Three solar particle events', blurb: 'Nominal GCR plus three SPEs (≈10, 25 and 8 mSv) with shelter protocol.' },
  'enhanced-shielding': { label: 'Enhanced shielding (−30%)', blurb: 'Water-wall and regolith shielding reduce effective dose.' },
}

/** Mission structure as fractions of total duration (transit / surface / transit). */
function gravityAt(day: number, duration: number): number {
  const f = day / duration
  if (f < 0.23) return 0
  if (f < 0.79) return 0.38
  return 0
}

function dailyDose(day: number, params: ScenarioParams): number {
  const g = gravityAt(day, params.durationDays)
  let base = g > 0 ? 0.48 : 1.78
  if (params.radiationScenario === 'solar-minimum') base *= 1.3
  if (params.radiationScenario === 'enhanced-shielding') base *= 0.7
  let event = 0
  if (params.radiationScenario === 'spe-series') {
    const events: [number, number][] = [
      [0.15, 10],
      [0.5, 25],
      [0.8, 8],
    ]
    for (const [frac, dose] of events) {
      const eventDay = Math.round(frac * params.durationDays)
      if (day === eventDay) event += dose * 0.65
      if (day === eventDay + 1) event += dose * 0.35
    }
  }
  return base + event
}

export function runScenario(params: ScenarioParams): ScenarioResult {
  const series: ScenarioPoint[] = []
  const exEff = clamp(params.exerciseSessionsPerWeek / 6, 0, 1.15) * 0.82
  let muscle = 100
  let bone = 100
  let cumulative = 0
  let sleepDebt = 0

  for (let day = 1; day <= params.durationDays; day++) {
    const g = gravityAt(day, params.durationDays)

    // Muscle: first-order approach to an equilibrium that depends on gravity and exercise.
    const muscleFloor = 100 - 34 * (1 - g) * (1 - exEff)
    muscle += (muscleFloor - muscle) * 0.012

    // Bone: steady loss rate modulated by gravity and exercise; no in-mission recovery.
    bone -= 0.04 * (1 - g) * (1 - 0.7 * exEff)

    // Sleep quality: disruption and stress reduce it; accumulated sleep debt erodes it slowly.
    sleepDebt = sleepDebt * 0.98 + (params.sleepDisruption / 100) * 0.4
    const sleepQuality = clamp(80 - 0.32 * params.sleepDisruption - 1.4 * (params.stressLevel - 4) - sleepDebt * 0.6 + (g > 0 ? 2 : 0), 25, 95)

    // Resting HR: deconditioning, poor sleep and stress all push it upward.
    const restingHR = 57 + 0.11 * (100 - muscle) + 0.07 * (80 - sleepQuality) + 0.5 * (params.stressLevel - 4) + (g === 0 ? 1.5 : 0)

    // Fatigue: sleep quality, stress and deconditioning.
    const fatigue = clamp(3 + 0.045 * (80 - sleepQuality) + 0.3 * (params.stressLevel - 4) + 0.03 * (100 - muscle), 1, 10)

    cumulative += dailyDose(day, params)

    // Readiness: an operational composite (0-100) of the above, for comparison only.
    // Radiation is excluded: it is a long-term risk, not a day-to-day operational capability.
    const readiness = clamp(100 - 0.9 * (100 - muscle) - 1.2 * (100 - bone) - 0.45 * (80 - sleepQuality) - 3.5 * (fatigue - 3), 0, 100)

    if (day % Math.max(1, Math.round(params.durationDays / 300)) === 0 || day === params.durationDays || day === 1) {
      series.push({
        day,
        muscleStrength: round1(muscle),
        boneDensity: round1(bone, 2),
        sleepQuality: round1(sleepQuality),
        restingHR: round1(restingHR),
        fatigue: round1(fatigue),
        radiationCumulative: round1(cumulative),
        readiness: round1(readiness),
      })
    }
  }
  return { params, series, final: series[series.length - 1] }
}

function round1(v: number, d = 1): number {
  const f = Math.pow(10, d)
  return Math.round(v * f) / f
}

export function baselineFor(params: ScenarioParams): ScenarioResult {
  return runScenario({ ...DEFAULT_PARAMS, durationDays: params.durationDays })
}

export function describeScenario(p: ScenarioParams): string[] {
  const out: string[] = []
  out.push(
    `A ${p.durationDays}-day mission profile with ${Math.round(p.durationDays * 0.23)} days of outbound transit in microgravity, ${Math.round(p.durationDays * 0.56)} days at Mars gravity (0.38 g) and ${Math.round(p.durationDays * 0.21)} days of return transit.`,
  )
  if (p.exerciseSessionsPerWeek >= 6) out.push(`Exercise is at the nominal countermeasure schedule (${p.exerciseSessionsPerWeek} sessions/week), which the model treats as retaining roughly 80% of its protective effect against muscle and bone loss in microgravity.`)
  else if (p.exerciseSessionsPerWeek >= 3) out.push(`Exercise is reduced to ${p.exerciseSessionsPerWeek} sessions/week. The model scales countermeasure effectiveness linearly, so muscle equilibrium and bone-loss rate both worsen in transit.`)
  else out.push(`Exercise is severely reduced (${p.exerciseSessionsPerWeek} sessions/week). Deconditioning in microgravity proceeds toward the uncountered equilibrium, which is the model's worst case.`)
  if (p.sleepDisruption <= 15) out.push('Sleep disruption is mild, consistent with routine schedule shifts.')
  else if (p.sleepDisruption <= 50) out.push(`Sleep disruption of ${p.sleepDisruption}% represents frequent schedule shifts, noise or shift work; sleep quality and fatigue degrade and the effect compounds slowly through accumulated sleep debt.`)
  else out.push(`Sleep disruption of ${p.sleepDisruption}% represents chronic sleep loss. Fatigue rises steeply and the modelled readiness index falls throughout the mission.`)
  out.push(RADIATION_SCENARIOS[p.radiationScenario].blurb + ' Doses are integrated daily into a cumulative mission effective dose.')
  if (p.stressLevel <= 4) out.push('Mission stress is within the nominal range.')
  else if (p.stressLevel <= 7) out.push(`Elevated mission stress (${p.stressLevel}/10) modestly raises resting heart rate and fatigue and lowers sleep quality.`)
  else out.push(`High mission stress (${p.stressLevel}/10) is a strong driver in the model, degrading sleep, fatigue and resting heart rate together.`)
  return out
}

export function operationalConsiderations(result: ScenarioResult, baseline: ScenarioResult): string[] {
  const out: string[] = []
  const f = result.final
  const b = baseline.final
  if (f.radiationCumulative >= 600) out.push(`Projected cumulative dose (${f.radiationCumulative.toFixed(0)} mSv) exceeds the 600 mSv career effective-dose limit in NASA-STD-3001. Shielding, mission duration or transit timing would need to change.`)
  else if (f.radiationCumulative >= 450) out.push(`Projected cumulative dose (${f.radiationCumulative.toFixed(0)} mSv) consumes most of the 600 mSv career limit in NASA-STD-3001, limiting future flight assignments.`)
  if (f.muscleStrength < 85) out.push(`Muscle strength index falls below 85% of pre-flight, which would challenge EVA workload and emergency egress capability on landing.`)
  if (f.boneDensity < 94) out.push(`Bone indicator falls to ${f.boneDensity.toFixed(1)}% of pre-flight; recovery after return is slow and fracture-risk review would be warranted.`)
  if (f.fatigue >= 6) out.push(`Sustained fatigue above 6/10 would argue for schedule protection, task re-sequencing and sleep countermeasures.`)
  if (f.sleepQuality < 60) out.push(`Low sleep quality for extended periods raises operational error risk; consider lighting, scheduling and workload interventions.`)
  if (f.readiness < b.readiness - 10) out.push(`Readiness index ends ${(b.readiness - f.readiness).toFixed(0)} points below baseline; the mission plan would carry reduced margin for contingency operations.`)
  if (out.length === 0) out.push('No modelled indicator crosses an operational threshold. Margins are similar to the baseline scenario.')
  return out
}

export const SIMULATOR_ASSUMPTIONS: string[] = [
  'Muscle strength follows a first-order approach to an equilibrium set by gravity and exercise effectiveness; magnitudes are informed by ISS countermeasure outcomes.',
  'Bone indicator declines at a constant daily rate in reduced gravity (order 0.3-1.5% per month depending on exercise), with no in-mission recovery.',
  'Radiation uses MSL/RAD-informed background rates (≈1.8 mSv/day in transit, ≈0.5 mSv/day in a shielded surface habitat) and discrete SPE doses.',
  'Sleep quality, fatigue and resting heart rate respond linearly to sleep disruption and stress, plus a slow accumulated sleep-debt term.',
  'The readiness index is an operational composite created for comparison between scenarios; it has no clinical meaning.',
  'Individual variability, countermeasure pharmacology, nutrition, illness, and crew interactions are not modelled.',
  'All outputs are illustrative. They are not validated medical predictions and must not inform real medical decisions.',
]
