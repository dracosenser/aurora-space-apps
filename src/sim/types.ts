// ---------------------------------------------------------------------------
// AURORA MISSION SIMULATOR — configuration and result types.
// Pure data: no React, no DOM. Configurations are JSON-serialisable.
// ---------------------------------------------------------------------------

export type Resolution = 'daily' | 'hourly'

export interface AstronautSchedule {
  /** Hour of day (0–23) the sleep period starts. */
  sleepStartHour: number
  /** Scheduled sleep opportunity, hours. */
  sleepHours: number
  /** Scheduled work hours per day. */
  workHours: number
  exerciseSessionsPerWeek: number
  exerciseMinutes: number
  /** Hour of day exercise is scheduled. */
  exerciseHour: number
  /** Workload level, 1 (light) to 5 (very heavy). */
  workload: number
}

export interface AstronautBaseline {
  restingHR: number
  hrv: number
  respRate: number
  spo2: number
  bodyTemp: number
  /**
   * How long this person usually sleeps when given the chance, hours (their
   * habit). Kept under its original name so saved missions still load.
   */
  sleepNeed: number
  /**
   * Physiological sleep need, hours. Defaults to 8 h (adults need 7–9 h).
   * Every night below it adds to sleep debt, whatever the person's habit.
   */
  sleepRequirement?: number
  /** Typical daily activity, minutes. */
  activityMinutes: number
  /** Day-to-day variation multiplier: 1 = typical, 0.5 = very steady, 2 = very variable. */
  variability: number
  systolicBP?: number
  diastolicBP?: number
}

export interface AstronautProfile {
  id: string
  name: string
  callsign: string
  role: string
  description: string
  responsibilities: string
  color: string
  /** Whether this person flies on the mission. Non-participants are kept on the roster but not simulated. */
  participates: boolean
  schedule: AstronautSchedule
  baseline: AstronautBaseline
}

export interface Environment {
  cabinTempC: number
  pressureKPa: number
  ppO2KPa: number
  co2mmHg: number
  humidityPct: number
  radiationMSvPerDay: number
  gravityG: number
  lightingLux: number
  noiseDBA: number
  vibrationMS2: number
  particulatesUgM3: number
}

export type EnvKey = keyof Environment

export type EventType =
  | 'workload'
  | 'sleep-disruption'
  | 'exercise-unavailable'
  | 'exercise-change'
  | 'comms-outage'
  | 'solar-particle-event'
  | 'eva'
  | 'recovery'
  | 'environment-anomaly'
  | 'lighting-change'
  | 'noise-change'
  | 'stress'
  | 'custom'

export interface MissionEvent {
  id: string
  type: EventType
  title: string
  /** First mission day (1-based). */
  startDay: number
  durationDays: number
  crewWide: boolean
  /** Used when crewWide is false. */
  astronautIds: string[]
  /** Numeric parameters; meaning depends on the event type (see events.ts). */
  params: Record<string, number>
  /** Environmental values that apply while the event is active. */
  envOverride?: Partial<Environment>
  notes: string
}

export interface Spacecraft {
  name: string
  habitableVolumeM3: number
  exerciseEquipment: string
}

export interface MissionConfig {
  id: string
  name: string
  missionCode: string
  destination: string
  description: string
  /** ISO date (YYYY-MM-DD) of mission day 1. */
  startDate: string
  durationDays: number
  resolution: Resolution
  seed: number
  spacecraft: Spacecraft
  environment: Environment
  crew: AstronautProfile[]
  events: MissionEvent[]
  /** If this is a scenario copy, the mission it was derived from. */
  scenarioOf: string | null
  updatedAt: number
}

// ------------------------------------------------------------------ results

/** Daily indicators produced for every astronaut. */
export type SimIndicator =
  | 'restingHR'
  | 'hrv'
  | 'respRate'
  | 'spo2'
  | 'bodyTemp'
  | 'sleepDuration'
  | 'sleepQuality'
  | 'activityMinutes'
  | 'workload'
  | 'stress'
  | 'fatigue'
  | 'radiationDose'
  | 'systolicBP'
  | 'diastolicBP'
  | 'exerciseMinutes'
  | 'muscleStrength'
  | 'boneDensity'
  | 'mood'
  | 'sleepConsistency'
  | 'sleepDebt'
  | 'pvtLapses'

/** Hourly channels, produced only at hourly resolution. */
export type HourlyChannel = 'heartRate' | 'respRate' | 'spo2' | 'bodyTemp' | 'activity'

export interface Contribution {
  effectId: string
  indicator: SimIndicator
  /** Change applied to the indicator on each day by this effect (index = day - 1). */
  daily: Float32Array
}

export interface AstronautRun {
  astronautId: string
  /** daily[indicator][day - 1] */
  daily: Record<SimIndicator, Float32Array>
  /** hourly[channel][hour index], only at hourly resolution. */
  hourly: Record<HourlyChannel, Float32Array> | null
  /** Modeled effects on each indicator, for explanation. Only non-zero effects are stored. */
  contributions: Contribution[]
}

export interface SimulationResult {
  configId: string
  /** Fingerprint of the inputs, so cached results can be recognised. */
  fingerprint: string
  days: number
  resolution: Resolution
  /** Environment actually in effect each day (after event overrides). env[key][day - 1] */
  environment: Record<EnvKey, Float32Array>
  astronauts: AstronautRun[]
  warnings: string[]
  ms: number
}
