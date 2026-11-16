import { createRng } from '../lib/random'
import { eventActiveOn, eventAffects } from './events'
import { ENV_PARAMS, NOMINAL_ENVIRONMENT, SIM_INDICATORS } from './reference'
import type { AstronautProfile, AstronautRun, Contribution, EnvKey, Environment, HourlyChannel, MissionConfig, MissionEvent, SimIndicator, SimulationResult } from './types'

/**
 * AURORA mission simulation engine.
 *
 * Deterministic: the same configuration and seed always give the same result.
 * Each astronaut's random variation comes from a seed derived from the mission
 * seed and the astronaut's id, so adding, removing or editing one astronaut
 * never changes another's numbers, and a scenario copy differs only where its
 * inputs differ.
 *
 * Every non-random change to an indicator is applied through a named effect
 * (reference.ts) and recorded, so any result can be explained.
 */

export const LIMITS = {
  maxCrew: 30,
  maxDaysDaily: 1100,
  maxDaysHourly: 365,
  minDaysForDetection: 21,
}

// ------------------------------------------------------------------ helpers

export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function fingerprint(config: MissionConfig): string {
  const { updatedAt: _u, name: _n, description: _d, ...inputs } = config
  void _u
  void _n
  void _d
  return hashString(JSON.stringify(inputs)).toString(36)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const MMHG_PER_KPA = 7.50062

/** SpO2 (%) for a given oxygen partial pressure and total pressure (kPa), via the alveolar gas equation and Severinghaus (1979). */
export function modelSpO2(ppO2KPa: number, pressureKPa: number): number {
  const pb = pressureKPa * MMHG_PER_KPA
  const ppo2 = ppO2KPa * MMHG_PER_KPA
  if (pb <= 47) return 0
  const pio2 = ppo2 * ((pb - 47) / pb)
  const pao2 = Math.max(1, pio2 - 40 / 0.8 - 10)
  return 100 / (23400 / (pao2 * pao2 * pao2 + 150 * pao2) + 1)
}

export const REFERENCE_SPO2 = modelSpO2(NOMINAL_ENVIRONMENT.ppO2KPa, 101.3)

// --------------------------------------------------------------- validation

export interface ValidationIssue {
  level: 'error' | 'warning'
  /** Which part of the configuration to change to fix it. */
  area: 'mission' | 'crew' | 'environment' | 'events'
  /** The astronaut or event concerned, when there is one. */
  targetId?: string
  message: string
}

export function participants(config: MissionConfig): AstronautProfile[] {
  return config.crew.filter((c) => c.participates)
}

export function validateConfig(config: MissionConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const maxDays = config.resolution === 'hourly' ? LIMITS.maxDaysHourly : LIMITS.maxDaysDaily
  if (!Number.isInteger(config.durationDays) || config.durationDays < 1) issues.push({ level: 'error', area: 'mission', message: `Mission duration is ${config.durationDays} days. Set it to at least 1 day.` })
  if (config.durationDays > maxDays)
    issues.push({ level: 'error', area: 'mission', message: `Mission duration is ${config.durationDays} days, but ${config.resolution} simulation supports up to ${maxDays}. ${config.resolution === 'hourly' ? 'Shorten the mission or switch Time resolution to Daily.' : `Shorten the mission to ${maxDays} days or fewer.`}` })
  const crew = participants(config)
  if (crew.length === 0) issues.push({ level: 'error', area: 'crew', message: config.crew.length === 0 ? 'The crew is empty. Add at least one astronaut.' : 'No astronaut is set to take part. Tick “Takes part” for at least one crew member.' })
  if (crew.length > LIMITS.maxCrew) issues.push({ level: 'error', area: 'crew', message: `${crew.length} astronauts are set to take part; one simulation supports up to ${LIMITS.maxCrew}. Untick “Takes part” for ${crew.length - LIMITS.maxCrew} of them.` })
  const ids = new Set<string>()
  for (const a of config.crew) {
    if (ids.has(a.id)) issues.push({ level: 'error', area: 'crew', targetId: a.id, message: `Two crew members share the id ${a.id}. Remove one and duplicate the other instead.` })
    ids.add(a.id)
    const b = a.baseline
    const who = a.name.trim() || a.id
    const checks: [number, number, number, string, string][] = [
      [b.restingHR, 30, 120, 'Resting HR', 'bpm'],
      [b.hrv, 5, 200, 'HRV', 'ms'],
      [b.respRate, 6, 30, 'Resp. rate', '/min'],
      [b.spo2, 80, 100, 'SpO₂', '%'],
      [b.bodyTemp, 34, 39, 'Body temp', '°C'],
      [b.sleepNeed, 3, 12, 'Typical sleep', 'h'],
      [b.variability, 0.2, 3, 'Variation', '×'],
      [b.systolicBP ?? 118, 70, 200, 'Systolic BP', 'mmHg'],
      [b.diastolicBP ?? 76, 40, 130, 'Diastolic BP', 'mmHg'],
      [a.schedule.sleepHours, 2, 14, 'Sleep period', 'h'],
      [a.schedule.workload, 1, 5, 'Workload', ''],
      [a.schedule.sleepStartHour, 0, 23, 'Sleep starts (hour)', ''],
      [a.schedule.exerciseSessionsPerWeek, 0, 14, 'Exercise sessions/week', ''],
      [a.schedule.exerciseMinutes, 0, 180, 'Minutes per session', 'min'],
    ]
    for (const [v, lo, hi, label, unit] of checks) {
      if (!Number.isFinite(v) || v < lo || v > hi)
        issues.push({ level: 'error', area: 'crew', targetId: a.id, message: `${who}: ${label} is ${Number.isFinite(v) ? `${v}${unit ? ` ${unit}` : ''}` : 'empty'}. Set it between ${lo} and ${hi}${unit ? ` ${unit}` : ''}.` })
    }
    if (!a.name.trim()) issues.push({ level: 'warning', area: 'crew', targetId: a.id, message: `Crew member ${a.id} has no name.` })
  }
  for (const p of ENV_PARAMS) {
    const v = config.environment[p.key]
    if (!Number.isFinite(v) || v < p.min || v > p.max) issues.push({ level: 'error', area: 'environment', message: `${p.label} is ${Number.isFinite(v) ? `${v} ${p.unit}` : 'empty'}. Set it between ${p.min} and ${p.max} ${p.unit}.` })
  }
  if (config.environment.ppO2KPa > config.environment.pressureKPa) issues.push({ level: 'error', area: 'environment', message: `Oxygen partial pressure (${config.environment.ppO2KPa} kPa) is higher than cabin pressure (${config.environment.pressureKPa} kPa). Lower the oxygen or raise the pressure.` })
  for (const e of config.events) {
    if (e.startDay > config.durationDays) issues.push({ level: 'warning', area: 'events', targetId: e.id, message: `"${e.title}" starts on day ${e.startDay}, after the mission ends on day ${config.durationDays}, so it will have no effect. Move its start day earlier.` })
    else if (e.startDay + e.durationDays - 1 > config.durationDays) issues.push({ level: 'warning', area: 'events', targetId: e.id, message: `"${e.title}" runs past the end of the mission and is cut off on day ${config.durationDays}.` })
    if (!e.crewWide && !e.astronautIds.some((id) => crew.some((c) => c.id === id))) issues.push({ level: 'warning', area: 'events', targetId: e.id, message: `"${e.title}" affects no participating astronaut. Tick "Entire crew" or choose who it affects.` })
  }
  if (config.durationDays < LIMITS.minDaysForDetection) issues.push({ level: 'warning', area: 'mission', message: `Missions shorter than ${LIMITS.minDaysForDetection} days are simulated, but anomaly detection needs about three weeks of data to build personal baselines.` })
  return issues
}

// ------------------------------------------------------------------- engine

interface DayInputs {
  env: Environment
  workload: number
  sleepOpportunity: number
  exerciseMin: number
  eventStress: number
  evaHours: number
  extraDose: number
  evaDoseMultiplier: number
  misalignment: number
}

/** The inputs one astronaut experiences on one day, after applying active events. */
export function dayInputs(config: MissionConfig, a: AstronautProfile, day: number, crewWideOnly = false): DayInputs {
  const env: Environment = { ...config.environment }
  let workload = a.schedule.workload
  let sleepLoss = 0
  let extraSleep = 0
  let availability = 1
  let sessions = a.schedule.exerciseSessionsPerWeek
  let minutes = a.schedule.exerciseMinutes
  let eventStress = 0
  let evaHours = 0
  let extraDose = 0
  let evaDoseMultiplier = 1
  let misalignment = 0

  for (const e of config.events) {
    if (crewWideOnly ? !e.crewWide : !eventAffects(e, a.id)) continue
    // Schedule shifts keep acting while the crew re-entrains after the event starts and after it ends.
    if (e.type === 'lighting-change' && day >= e.startDay) {
      const s = Math.abs(e.params.shiftHours ?? 0)
      misalignment += Math.max(0, s - (day - e.startDay))
      const end = e.startDay + e.durationDays
      if (day >= end) misalignment += Math.max(0, s - (day - end))
    }
    if (!eventActiveOn(e, day)) continue
    if (e.envOverride) for (const [k, v] of Object.entries(e.envOverride)) if (typeof v === 'number' && Number.isFinite(v)) env[k as EnvKey] = v
    const p = e.params
    workload += (p.workloadIncrease ?? 0) - (p.workloadReduction ?? 0)
    sleepLoss += p.sleepLossHours ?? 0
    extraSleep += p.extraSleepHours ?? 0
    eventStress += p.stressIncrease ?? 0
    if (p.availabilityPct !== undefined) availability = Math.min(availability, clamp(p.availabilityPct, 0, 100) / 100)
    if (e.type === 'exercise-change') {
      sessions = p.sessionsPerWeek ?? sessions
      minutes = p.minutes ?? minutes
    }
    if (e.type === 'eva') {
      evaHours += p.hours ?? 0
      evaDoseMultiplier = Math.max(evaDoseMultiplier, p.doseMultiplier ?? 1)
    }
    if (e.type === 'solar-particle-event') extraDose += (p.doseMSv ?? 0) / Math.max(1, e.durationDays)
  }
  return {
    env,
    workload: clamp(workload, 0, 10),
    sleepOpportunity: clamp(a.schedule.sleepHours - sleepLoss + extraSleep, 0, 14),
    exerciseMin: (Math.max(0, sessions) * Math.max(0, minutes) * availability) / 7,
    eventStress,
    evaHours: clamp(evaHours, 0, 12),
    extraDose,
    evaDoseMultiplier,
    misalignment,
  }
}

const NOISE_SD: Record<SimIndicator, number> = {
  restingHR: 1.8,
  hrv: 5,
  respRate: 0.6,
  spo2: 0.45,
  bodyTemp: 0.12,
  sleepDuration: 0.45,
  sleepQuality: 4,
  activityMinutes: 10,
  workload: 0,
  stress: 0.35,
  fatigue: 0.4,
  radiationDose: 0,
  systolicBP: 3,
  diastolicBP: 2,
  exerciseMinutes: 6,
  muscleStrength: 0.15,
  boneDensity: 0.01,
  mood: 0.45,
  sleepConsistency: 3,
}

function simulateAstronaut(config: MissionConfig, a: AstronautProfile, days: number, hourly: boolean): AstronautRun {
  const rng = createRng(hashString(`${config.seed}:${a.id}`))
  const daily = Object.fromEntries(SIM_INDICATORS.map((d) => [d.id, new Float32Array(days)])) as Record<SimIndicator, Float32Array>
  const contrib = new Map<string, Contribution>()
  const add = (effectId: string, indicator: SimIndicator, day: number, delta: number) => {
    if (delta === 0 || !Number.isFinite(delta)) return
    const key = `${effectId}|${indicator}`
    let c = contrib.get(key)
    if (!c) {
      c = { effectId, indicator, daily: new Float32Array(days) }
      contrib.set(key, c)
    }
    c.daily[day - 1] += delta
  }

  const b = a.baseline
  const s = a.schedule
  const typical = b.sleepNeed
  const nominalExercise = (s.exerciseSessionsPerWeek * s.exerciseMinutes) / 7
  const baseStress = 1 + 0.6 * s.workload
  const baseFatigue = 1.5 + 0.35 * baseStress + 0.2 * s.workload
  const ar = Object.fromEntries(SIM_INDICATORS.map((d) => [d.id, 0])) as Record<SimIndicator, number>
  const noise = (id: SimIndicator) => {
    ar[id] = 0.3 * ar[id] + rng.normal(0, NOISE_SD[id] * b.variability)
    return ar[id]
  }

  let debt = 0
  let decon = 0
  let muscle = 100
  let bone = 100
  const lastSleep: number[] = []
  const sys0 = b.systolicBP ?? 118
  const dia0 = b.diastolicBP ?? 76
  const hours: Record<HourlyChannel, Float32Array> | null = hourly
    ? { heartRate: new Float32Array(days * 24), respRate: new Float32Array(days * 24), spo2: new Float32Array(days * 24), bodyTemp: new Float32Array(days * 24), activity: new Float32Array(days * 24) }
    : null

  for (let day = 1; day <= days; day++) {
    const i = day - 1
    const x = dayInputs(config, a, day)
    const env = x.env

    // Oxygen supply → saturation → heart rate.
    const dSpO2 = modelSpO2(env.ppO2KPa, env.pressureKPa) - REFERENCE_SPO2
    add('oxygen-saturation', 'spo2', day, dSpO2)
    const hypoxHR = 0.5 * Math.max(0, -dSpO2)
    add('hypoxemia-heart-rate', 'restingHR', day, hypoxHR)

    // Sleep.
    const allowed = Math.min(x.sleepOpportunity * 0.95, typical)
    add('sleep-opportunity', 'sleepDuration', day, allowed - typical)
    const outside = env.cabinTempC < 18 ? env.cabinTempC - 18 : env.cabinTempC > 27 ? env.cabinTempC - 27 : 0
    const pen = {
      noise: 0.006 * Math.max(0, env.noiseDBA - 50),
      co2: 0.015 * Math.max(0, env.co2mmHg - 3),
      temp: 0.01 * Math.abs(outside),
      circ: 0.04 * x.misalignment,
    }
    const scale = Math.min(1, 0.6 / Math.max(1e-9, pen.noise + pen.co2 + pen.temp + pen.circ))
    const effects: [string, number][] = [
      ['noise-sleep', pen.noise * scale],
      ['co2-sleep', pen.co2 * scale],
      ['temperature-sleep', pen.temp * scale],
      ['circadian-shift', pen.circ * scale],
    ]
    let sleep = allowed
    let quality = 82
    for (const [id, p] of effects) {
      add(id, 'sleepDuration', day, -allowed * p)
      add(id, 'sleepQuality', day, -60 * p)
      sleep -= allowed * p
      quality -= 60 * p
    }
    const co2Quality = -3 * Math.max(0, env.co2mmHg - 3)
    add('co2-sleep', 'sleepQuality', day, co2Quality)
    quality += co2Quality

    // Sleep debt (3-day exponentially weighted shortfall), stress, deconditioning.
    debt = (2 / 3) * debt + (1 / 3) * Math.max(0, typical - sleep)
    const stress = clamp(1 + 0.6 * x.workload + x.eventStress + 0.5 * debt, 0, 10)
    add('workload-stress', 'stress', day, stress - baseStress)
    add('workload-stress', 'workload', day, x.workload - s.workload)
    const stressExcess = Math.max(0, stress - 3)
    add('stress-sleep', 'sleepQuality', day, -2 * stressExcess)
    quality -= 2 * stressExcess

    const exFraction = Math.min(1, x.exerciseMin / 60)
    const target = 8 * (1 - exFraction) * Math.max(0, 1 - env.gravityG)
    decon += (target - decon) / 21

    // Cardiovascular.
    const hrDebt = 1.2 * debt
    const hrStress = 0.8 * stressExcess
    add('sleep-debt-cardio', 'restingHR', day, hrDebt)
    add('stress-cardio', 'restingHR', day, hrStress)
    add('deconditioning', 'restingHR', day, decon)
    add('sleep-debt-cardio', 'hrv', day, -4 * debt)
    add('stress-cardio', 'hrv', day, -2 * stressExcess)
    add('deconditioning', 'hrv', day, -1.25 * decon)

    // Breathing and temperature.
    const rrCO2 = 0.25 * Math.max(0, env.co2mmHg - 3)
    add('co2-ventilation', 'respRate', day, rrCO2)
    const tempShift = 0.05 * outside
    add('thermal-body-temperature', 'bodyTemp', day, tempShift)

    // Activity, fatigue, dose.
    const activityDelta = x.exerciseMin - nominalExercise + x.evaHours * 60
    add('activity-accounting', 'activityMinutes', day, activityDelta)
    const fatigue = clamp(1.5 + 0.9 * debt + 0.35 * stress + 0.2 * x.workload + x.evaHours / 6, 0, 10)
    add('fatigue-model', 'fatigue', day, fatigue - baseFatigue)
    const background = config.environment.radiationMSvPerDay
    const dose = env.radiationMSvPerDay + x.extraDose + x.evaHours * (env.radiationMSvPerDay / 24) * (x.evaDoseMultiplier - 1)
    add('dose-accounting', 'radiationDose', day, dose - background)

    daily.restingHR[i] = clamp(b.restingHR + hypoxHR + hrDebt + hrStress + decon + noise('restingHR'), 30, 200)
    daily.hrv[i] = clamp(b.hrv - 4 * debt - 2 * stressExcess - 1.25 * decon + noise('hrv'), 5, 250)
    daily.respRate[i] = clamp(b.respRate + rrCO2 + noise('respRate'), 4, 60)
    daily.spo2[i] = clamp(b.spo2 + dSpO2 + noise('spo2'), 50, 100)
    daily.bodyTemp[i] = clamp(b.bodyTemp + tempShift + noise('bodyTemp'), 33, 42)
    daily.sleepDuration[i] = clamp(sleep + noise('sleepDuration'), 0, 14)
    daily.sleepQuality[i] = clamp(quality + noise('sleepQuality'), 0, 100)
    daily.activityMinutes[i] = clamp(b.activityMinutes + activityDelta + noise('activityMinutes'), 0, 1440)
    daily.workload[i] = x.workload
    daily.stress[i] = clamp(stress + noise('stress'), 0, 10)
    daily.fatigue[i] = clamp(fatigue + noise('fatigue'), 0, 10)
    daily.radiationDose[i] = Math.max(0, dose * (1 + rng.normal(0, 0.03)))

    // Musculoskeletal state, mood, exercise log, blood pressure, sleep consistency.
    const g = Math.max(0, 1 - env.gravityG)
    const exEff = 0.82 * exFraction
    const muscleFloor = 100 - 34 * g * (1 - exEff)
    muscle += (muscleFloor - muscle) * 0.012
    bone -= 0.04 * g * (1 - 0.7 * exEff)
    add('muscle-deconditioning', 'muscleStrength', day, muscle - 100)
    add('bone-loss', 'boneDensity', day, bone - 100)
    const moodStress = -0.6 * stressExcess
    const moodDebt = -0.4 * debt
    add('mood-model', 'mood', day, moodStress + moodDebt)
    add('exercise-log', 'exerciseMinutes', day, x.exerciseMin - nominalExercise)
    daily.muscleStrength[i] = clamp(muscle + noise('muscleStrength'), 30, 130)
    daily.boneDensity[i] = clamp(bone + noise('boneDensity'), 70, 105)
    daily.mood[i] = clamp(7.5 + moodStress + moodDebt + noise('mood'), 0, 10)
    daily.exerciseMinutes[i] = clamp(x.exerciseMin + (x.exerciseMin > 0 ? noise('exerciseMinutes') : 0), 0, 400)
    daily.systolicBP[i] = clamp(sys0 + noise('systolicBP'), 60, 220)
    daily.diastolicBP[i] = clamp(dia0 + noise('diastolicBP'), 35, 140)
    lastSleep.push(daily.sleepDuration[i])
    if (lastSleep.length > 7) lastSleep.shift()
    let mu = 0
    for (const v of lastSleep) mu += v
    mu /= lastSleep.length
    let varSum = 0
    for (const v of lastSleep) varSum += (v - mu) * (v - mu)
    const sdSleep = lastSleep.length > 1 ? Math.sqrt(varSum / (lastSleep.length - 1)) : 0.35
    daily.sleepConsistency[i] = clamp(92 - 26 * sdSleep + noise('sleepConsistency'), 0, 100)

    if (hours) {
      // Diurnal rendering of the day's state. Heart rate is lower asleep and
      // raised during exercise and EVA; core temperature follows a circadian
      // rhythm of ±0.35 °C peaking in the late afternoon.
      const sleepStart = ((Math.round(s.sleepStartHour) % 24) + 24) % 24
      const sleepLen = daily.sleepDuration[i]
      const exHours = x.exerciseMin / 60
      for (let h = 0; h < 24; h++) {
        const k = i * 24 + h
        const sinceSleep = (h - sleepStart + 24) % 24
        const asleep = sinceSleep < sleepLen
        const exercising = !asleep && h >= s.exerciseHour && h < s.exerciseHour + Math.ceil(exHours) && exHours > 0
        const eva = !asleep && x.evaHours > 0 && h >= 9 && h < 9 + Math.ceil(x.evaHours)
        const base = daily.restingHR[i]
        hours.heartRate[k] = base * (asleep ? 0.93 : 1.1) + (exercising ? 45 * Math.min(1, exHours) : 0) + (eva ? 25 : 0) + rng.normal(0, 1.5)
        hours.respRate[k] = daily.respRate[i] + (asleep ? -1.2 : 0.8) + (exercising ? 9 : 0) + (eva ? 5 : 0) + rng.normal(0, 0.4)
        hours.spo2[k] = Math.min(100, daily.spo2[i] + (asleep ? -0.4 : 0) + rng.normal(0, 0.25))
        hours.bodyTemp[k] = daily.bodyTemp[i] + 0.35 * Math.cos((2 * Math.PI * (h - 17)) / 24) + (exercising ? 0.4 : 0) + rng.normal(0, 0.04)
        hours.activity[k] = asleep ? 0 : exercising ? 3 : eva ? 2.5 : 1
      }
    }
  }

  return { astronautId: a.id, daily, hourly: hours, contributions: [...contrib.values()] }
}

/** Run a mission. Throws if the configuration has blocking errors. */
export function simulate(config: MissionConfig): SimulationResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const issues = validateConfig(config)
  const errors = issues.filter((i) => i.level === 'error')
  if (errors.length) throw new Error(errors.map((e) => e.message).join(' '))
  const days = config.durationDays
  const crew = participants(config)
  const hourly = config.resolution === 'hourly'

  // The shared cabin environment, with crew-wide event overrides applied.
  const environment = Object.fromEntries(ENV_PARAMS.map((p) => [p.key, new Float32Array(days)])) as Record<EnvKey, Float32Array>
  const probe = crew[0]
  for (let day = 1; day <= days; day++) {
    const env = dayInputs(config, probe, day, true).env
    for (const p of ENV_PARAMS) environment[p.key][day - 1] = env[p.key]
  }

  const astronauts = crew.map((a) => simulateAstronaut(config, a, days, hourly))
  return {
    configId: config.id,
    fingerprint: fingerprint(config),
    days,
    resolution: config.resolution,
    environment,
    astronauts,
    warnings: issues.filter((i) => i.level === 'warning').map((i) => i.message),
    ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
  }
}

/** Events that were active for an astronaut during a window of days. */
export function eventsDuring(config: MissionConfig, astronautId: string, from: number, to: number): MissionEvent[] {
  return config.events.filter((e) => eventAffects(e, astronautId) && e.startDay <= to && e.startDay + e.durationDays - 1 >= from)
}
