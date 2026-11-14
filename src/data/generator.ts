import type { Astronaut, DailyRecord } from '../types'
import { createRng, type Rng } from '../lib/random'
import { clamp, round, std } from '../lib/stats'
import { ASTRONAUTS } from './astronauts'
import { MISSION, phaseForDay } from './mission'

/**
 * Synthetic demonstration data generator.
 *
 * Everything produced here is SIMULATED. Magnitudes are informed by published
 * spaceflight research (see src/data/sources.ts and docs/METHODOLOGY.md) but
 * no value is a real astronaut measurement.
 */

const SEED = 20260314

interface Injection {
  astronautId: string
  start: number
  end: number
  apply: (rec: Partial<DailyRecord>, t: number, rng: Rng) => void
}

/** t = progress through the injection window, 0..1 */
const INJECTIONS: Injection[] = [
  // Arakawa: night repair shifts -> irregular, short sleep (days 395-401), lingers to 404.
  {
    astronautId: 'AUR-02',
    start: 394,
    end: 404,
    apply: (r, t, rng) => {
      const intensity = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2
      r.sleepDuration = (r.sleepDuration ?? 6.4) - intensity * (1.4 + rng.range(-1.2, 1.2))
      r.sleepConsistency = (r.sleepConsistency ?? 80) - intensity * 28
      r.sleepQuality = (r.sleepQuality ?? 75) - intensity * 14
      r.fatigue = (r.fatigue ?? 3.5) + intensity * 1.8
      r.stress = (r.stress ?? 3.5) + intensity * 1.2
    },
  },
  // Ferreira: treadmill fault + rover science priority -> exercise down, HR up, HRV down, fatigue up (388 -> ongoing).
  {
    astronautId: 'AUR-04',
    start: 390,
    end: 412,
    apply: (r, t) => {
      const ramp = Math.min(1, t / 0.6)
      r.exerciseMinutes = (r.exerciseMinutes ?? 105) * (1 - 0.42 * ramp)
      r.restingHR = (r.restingHR ?? 54) + 7.5 * ramp
      r.hrv = (r.hrv ?? 74) - 14 * ramp
      r.fatigue = (r.fatigue ?? 3) + 2.2 * ramp
      r.mood = (r.mood ?? 7.2) - 1.1 * ramp
      r.muscleStrength = (r.muscleStrength ?? 94) - 1.6 * ramp
      r.sleepQuality = (r.sleepQuality ?? 78) - 6 * ramp
    },
  },
  // Holt: conjunction blackout -> stress/mood shift (335-349), resolved after.
  {
    astronautId: 'AUR-01',
    start: 336,
    end: 352,
    apply: (r, t) => {
      const intensity = t < 0.75 ? Math.min(1, t / 0.3) : 1 - (t - 0.75) / 0.25
      r.stress = (r.stress ?? 3.8) + 3.1 * intensity
      r.mood = (r.mood ?? 7) - 2.4 * intensity
      r.sleepQuality = (r.sleepQuality ?? 76) - 9 * intensity
      r.hrv = (r.hrv ?? 62) - 7 * intensity
    },
  },
  // Diallo: dust storm confinement -> shorter sleep + lower mood (300-306).
  {
    astronautId: 'AUR-03',
    start: 300,
    end: 308,
    apply: (r, t) => {
      const intensity = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2
      r.sleepDuration = (r.sleepDuration ?? 6.9) - 1.1 * intensity
      r.mood = (r.mood ?? 7.4) - 1.3 * intensity
      r.exerciseMinutes = (r.exerciseMinutes ?? 90) * (1 - 0.25 * intensity)
    },
  },
  // Diallo: gradual systolic creep in late surface ops (research-indicator level, mild).
  {
    astronautId: 'AUR-03',
    start: 370,
    end: 412,
    apply: (r, t) => {
      r.systolicBP = (r.systolicBP ?? 114) + 9 * t
      r.diastolicBP = (r.diastolicBP ?? 72) + 3 * t
    },
  },
]

/** Crew-wide radiation events: day -> extra effective dose in mSv for every crew member. */
const RADIATION_EVENTS: Record<number, number> = {
  96: 7.8,
  97: 4.6,
  98: 1.1,
  405: 2.4,
  406: 0.6,
}

function dailyDoseBaseline(day: number): number {
  const phase = phaseForDay(day)
  // Informed by MSL/RAD cruise (~1.8 mSv/day) and surface (~0.6-0.7 mSv/day) measurements
  // with an assumed habitat shielding factor on the surface.
  if (phase.id === 'surface') return 0.48
  if (phase.id === 'earth') return 0.01
  return 1.78
}

function generateFor(astro: Astronaut, days: number, rng: Rng): DailyRecord[] {
  const out: DailyRecord[] = []
  const b = astro.baseline

  // Slow-moving individual drift components (random walk, mean-reverting).
  let hrDrift = 0
  let sleepDrift = 0
  let moodDrift = 0
  let cumulative = 0
  let muscle = 100
  let bone = 100
  // Weekly BP measurement, interpolated.
  let bpSys = b.systolicBP
  let bpDia = b.diastolicBP
  let nextBpSys = bpSys
  let nextBpDia = bpDia

  const recentSleep: number[] = []

  for (let day = 1; day <= days; day++) {
    const phase = phaseForDay(day)
    const g = phase.gravity
    const dow = day % 7

    hrDrift = hrDrift * 0.96 + rng.normal(0, 0.45)
    sleepDrift = sleepDrift * 0.95 + rng.normal(0, 0.12)
    moodDrift = moodDrift * 0.95 + rng.normal(0, 0.18)

    // Structural physiology: microgravity deconditioning with countermeasures; partial relief at 0.38 g.
    const exerciseEff = 0.82
    const muscleFloor = 100 - 34 * (1 - g) * (1 - exerciseEff)
    muscle += (muscleFloor - muscle) * 0.012 + rng.normal(0, 0.08)
    bone -= 0.04 * (1 - g) * (1 - 0.7 * exerciseEff) + rng.normal(0, 0.006)

    // Exercise: lighter on the rest day, with scheduling noise.
    const restDay = dow === 6
    const exercise = restDay ? b.exerciseMinutes * 0.35 : b.exerciseMinutes + rng.normal(0, 12)

    // Sleep: ISS literature suggests ~6 h average in flight; add mild phase effects.
    const phaseSleep = phase.id === 'outbound' || phase.id === 'return' ? -0.15 : 0
    const sleepDuration = b.sleepDuration + phaseSleep + sleepDrift + rng.normal(0, 0.55)

    // Weekly BP measurement.
    if (day % 7 === 1) {
      bpSys = nextBpSys
      bpDia = nextBpDia
      nextBpSys = b.systolicBP + rng.normal(0, 2.0) + (1 - g) * -1.5
      nextBpDia = b.diastolicBP + rng.normal(0, 1.6)
    }
    const f = (day % 7) / 7
    const systolic = bpSys + (nextBpSys - bpSys) * f
    const diastolic = bpDia + (nextBpDia - bpDia) * f

    const stress = 3.4 + (phase.id === 'moi' || phase.id === 'launch' ? 1.6 : 0) + rng.normal(0, 0.7) - moodDrift * 0.4
    const mood = 7.2 + moodDrift + rng.normal(0, 0.6) - (phase.id === 'outbound' ? 0.3 : 0)
    const fatigue = 3.2 + (7 - Math.min(7, sleepDuration)) * 0.8 + rng.normal(0, 0.6) + (phase.id === 'outbound' ? 0.3 : 0)

    const restingHR =
      b.restingHR + hrDrift + (1 - g) * 1.5 + (6.5 - sleepDuration) * 0.9 + rng.normal(0, 1.4) + (100 - muscle) * 0.12
    const hrv = b.hrv - hrDrift * 2.2 - (6.5 - sleepDuration) * 2.5 + rng.normal(0, 4) - (stress - 3.4) * 1.6

    const rec: Partial<DailyRecord> = {
      day,
      astronautId: astro.id,
      restingHR,
      hrv,
      systolicBP: systolic,
      diastolicBP: diastolic,
      sleepDuration,
      sleepQuality: 78 - (6.8 - sleepDuration) * 6 + rng.normal(0, 5) - (stress - 3.4) * 2,
      exerciseMinutes: exercise,
      muscleStrength: muscle,
      boneDensity: bone,
      stress,
      mood,
      fatigue,
    }

    // Apply scenario injections.
    for (const inj of INJECTIONS) {
      if (inj.astronautId !== astro.id || day < inj.start || day > inj.end) continue
      const t = (day - inj.start) / Math.max(1, inj.end - inj.start)
      inj.apply(rec, t, rng)
    }

    // Sleep consistency from the trailing 7 days of duration variability (plus a timing-regularity term).
    recentSleep.push(rec.sleepDuration ?? sleepDuration)
    if (recentSleep.length > 7) recentSleep.shift()
    const sdSleep = recentSleep.length >= 3 ? std(recentSleep) : 0.5
    const consistencyBase = 92 - sdSleep * 26 + rng.normal(0, 3)
    rec.sleepConsistency = rec.sleepConsistency !== undefined ? rec.sleepConsistency + (consistencyBase - 80) : consistencyBase

    // Radiation.
    const dose = dailyDoseBaseline(day) * (1 + rng.normal(0, 0.07)) + (RADIATION_EVENTS[day] ?? 0) * rng.range(0.92, 1.08)
    cumulative += dose

    out.push({
      day,
      astronautId: astro.id,
      restingHR: round(clamp(rec.restingHR!, 40, 110), 0),
      hrv: round(clamp(rec.hrv!, 12, 140), 0),
      systolicBP: round(clamp(rec.systolicBP!, 90, 160), 0),
      diastolicBP: round(clamp(rec.diastolicBP!, 50, 100), 0),
      sleepDuration: round(clamp(rec.sleepDuration!, 2.5, 10), 1),
      sleepConsistency: round(clamp(rec.sleepConsistency!, 10, 100), 0),
      sleepQuality: round(clamp(rec.sleepQuality!, 20, 100), 0),
      exerciseMinutes: round(clamp(rec.exerciseMinutes!, 0, 180), 0),
      muscleStrength: round(clamp(rec.muscleStrength!, 60, 102), 1),
      boneDensity: round(clamp(rec.boneDensity!, 85, 101), 2),
      radiationDaily: round(dose, 3),
      radiationCumulative: round(cumulative, 2),
      stress: round(clamp(rec.stress!, 1, 10), 1),
      mood: round(clamp(rec.mood!, 1, 10), 1),
      fatigue: round(clamp(rec.fatigue!, 1, 10), 1),
    })
  }
  return out
}

export function generateMissionRecords(days: number = MISSION.currentDay): DailyRecord[] {
  const records: DailyRecord[] = []
  ASTRONAUTS.forEach((astro, i) => {
    const rng = createRng(SEED + i * 7919)
    records.push(...generateFor(astro, days, rng))
  })
  return records
}
