import type { EnvKey, EventType, MissionEvent } from './types'

/**
 * Event catalogue. Every event changes only *inputs* to the model (schedule,
 * workload, stress, exercise, dose, environment). Its health consequences
 * come from the documented effects in reference.ts, never from a hard-coded
 * "health penalty".
 */

export interface EventParamDef {
  key: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  default: number
}

export interface EventTypeDef {
  type: EventType
  label: string
  description: string
  params: EventParamDef[]
  /** Environmental variables the user may override for this event. */
  env: EnvKey[]
  /** Effects (by id in reference.ts) through which this event can act. */
  actsThrough: string[]
  defaultDuration: number
}

export const EVENT_TYPES: EventTypeDef[] = [
  {
    type: 'workload', label: 'Increased workload', description: 'More work hours and a heavier workload.',
    params: [{ key: 'workloadIncrease', label: 'Workload increase', unit: 'levels', min: 0, max: 4, step: 0.5, default: 1.5 }, { key: 'sleepLossHours', label: 'Sleep opportunity lost', unit: 'h/night', min: 0, max: 6, step: 0.25, default: 0.5 }],
    env: [], actsThrough: ['workload-stress', 'sleep-opportunity', 'fatigue-model'], defaultDuration: 14,
  },
  {
    type: 'sleep-disruption', label: 'Sleep schedule disruption', description: 'Night work, alarms or shortened sleep periods.',
    params: [{ key: 'sleepLossHours', label: 'Sleep opportunity lost', unit: 'h/night', min: 0, max: 8, step: 0.25, default: 1.5 }],
    env: [], actsThrough: ['sleep-opportunity', 'sleep-debt-cardio', 'fatigue-model'], defaultDuration: 7,
  },
  {
    type: 'exercise-unavailable', label: 'Exercise equipment unavailable', description: 'Scheduled exercise cannot take place.',
    params: [{ key: 'availabilityPct', label: 'Exercise still possible', unit: '%', min: 0, max: 100, step: 5, default: 0 }],
    env: [], actsThrough: ['activity-accounting', 'deconditioning'], defaultDuration: 10,
  },
  {
    type: 'exercise-change', label: 'Exercise schedule change', description: 'A new exercise prescription for the period.',
    params: [{ key: 'sessionsPerWeek', label: 'Sessions per week', unit: '/week', min: 0, max: 14, step: 1, default: 6 }, { key: 'minutes', label: 'Minutes per session', unit: 'min', min: 0, max: 180, step: 5, default: 75 }],
    env: [], actsThrough: ['activity-accounting', 'deconditioning'], defaultDuration: 30,
  },
  {
    type: 'comms-outage', label: 'Communications outage', description: 'Loss or degradation of contact with the ground.',
    params: [{ key: 'stressIncrease', label: 'Stress increase', unit: 'points', min: 0, max: 5, step: 0.5, default: 1.5 }],
    env: [], actsThrough: ['workload-stress', 'stress-sleep', 'stress-cardio'], defaultDuration: 14,
  },
  {
    type: 'solar-particle-event', label: 'Solar particle event', description: 'Elevated radiation, usually with time in a storm shelter.',
    params: [{ key: 'doseMSv', label: 'Additional dose', unit: 'mSv', min: 0, max: 500, step: 0.5, default: 15 }, { key: 'sleepLossHours', label: 'Sleep lost to sheltering', unit: 'h/night', min: 0, max: 8, step: 0.25, default: 2 }, { key: 'stressIncrease', label: 'Stress increase', unit: 'points', min: 0, max: 5, step: 0.5, default: 1 }],
    env: [], actsThrough: ['dose-accounting', 'sleep-opportunity', 'workload-stress'], defaultDuration: 2,
  },
  {
    type: 'eva', label: 'EVA (spacewalk)', description: 'Extravehicular activity on each day of the event.',
    params: [{ key: 'hours', label: 'EVA hours per day', unit: 'h', min: 0, max: 10, step: 0.5, default: 6.5 }, { key: 'doseMultiplier', label: 'Dose rate outside vs inside', unit: '×', min: 1, max: 5, step: 0.1, default: 1.5 }, { key: 'sleepLossHours', label: 'Sleep opportunity lost', unit: 'h/night', min: 0, max: 4, step: 0.25, default: 1 }],
    env: [], actsThrough: ['activity-accounting', 'dose-accounting', 'fatigue-model', 'sleep-opportunity'], defaultDuration: 1,
  },
  {
    type: 'recovery', label: 'Recovery period', description: 'Lighter schedule and protected sleep.',
    params: [{ key: 'workloadReduction', label: 'Workload reduction', unit: 'levels', min: 0, max: 4, step: 0.5, default: 1 }, { key: 'extraSleepHours', label: 'Extra sleep opportunity', unit: 'h/night', min: 0, max: 4, step: 0.25, default: 1 }],
    env: [], actsThrough: ['workload-stress', 'sleep-opportunity'], defaultDuration: 7,
  },
  {
    type: 'environment-anomaly', label: 'Environmental anomaly', description: 'A life-support or environmental fault. Set the values that apply during it.',
    params: [], env: ['co2mmHg', 'cabinTempC', 'ppO2KPa', 'pressureKPa', 'humidityPct', 'particulatesUgM3', 'noiseDBA'],
    actsThrough: ['oxygen-saturation', 'co2-sleep', 'co2-ventilation', 'temperature-sleep', 'thermal-body-temperature', 'noise-sleep'], defaultDuration: 5,
  },
  {
    type: 'lighting-change', label: 'Lighting schedule change', description: 'The light/dark schedule moves, shifting the sleep period.',
    params: [{ key: 'shiftHours', label: 'Schedule shift', unit: 'h', min: -12, max: 12, step: 0.5, default: 3 }],
    env: ['lightingLux'], actsThrough: ['circadian-shift'], defaultDuration: 7,
  },
  {
    type: 'noise-change', label: 'Noise level change', description: 'A fan, pump or equipment change alters background noise.',
    params: [], env: ['noiseDBA'], actsThrough: ['noise-sleep'], defaultDuration: 10,
  },
  {
    type: 'stress', label: 'Mission stress event', description: 'An operational emergency, conflict or other stressor.',
    params: [{ key: 'stressIncrease', label: 'Stress increase', unit: 'points', min: 0, max: 5, step: 0.5, default: 2 }],
    env: [], actsThrough: ['workload-stress', 'stress-sleep', 'stress-cardio', 'fatigue-model'], defaultDuration: 3,
  },
  {
    type: 'custom', label: 'Custom event', description: 'Combine any of the model inputs.',
    params: [
      { key: 'workloadIncrease', label: 'Workload change', unit: 'levels', min: -4, max: 4, step: 0.5, default: 0 },
      { key: 'sleepLossHours', label: 'Sleep opportunity lost', unit: 'h/night', min: -4, max: 8, step: 0.25, default: 0 },
      { key: 'stressIncrease', label: 'Stress change', unit: 'points', min: -3, max: 5, step: 0.5, default: 0 },
      { key: 'availabilityPct', label: 'Exercise still possible', unit: '%', min: 0, max: 100, step: 5, default: 100 },
    ],
    env: ['co2mmHg', 'cabinTempC', 'ppO2KPa', 'noiseDBA', 'radiationMSvPerDay', 'gravityG'], actsThrough: ['workload-stress', 'sleep-opportunity', 'activity-accounting'], defaultDuration: 7,
  },
]

export const EVENT_TYPE_BY_ID = Object.fromEntries(EVENT_TYPES.map((t) => [t.type, t])) as Record<EventType, EventTypeDef>

export function defaultParams(type: EventType): Record<string, number> {
  return Object.fromEntries(EVENT_TYPE_BY_ID[type].params.map((p) => [p.key, p.default]))
}

export function eventActiveOn(e: MissionEvent, day: number): boolean {
  return day >= e.startDay && day < e.startDay + e.durationDays
}

export function eventAffects(e: MissionEvent, astronautId: string): boolean {
  return e.crewWide || e.astronautIds.includes(astronautId)
}
