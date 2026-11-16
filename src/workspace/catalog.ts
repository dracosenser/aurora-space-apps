import type { CategoryDef } from '../engine/types'
import type { WorkspaceIndicator } from './types'

/**
 * The built-in indicator catalogue for a user-defined mission.
 *
 * Plausible ranges are physical screening limits that catch typing errors and
 * sensor glitches. They are not clinical ranges.
 */

export const WORKSPACE_CATEGORIES: CategoryDef[] = [
  { id: 'cardiovascular', label: 'Cardiovascular', description: 'Heart rate, variability and blood pressure.' },
  { id: 'sleep', label: 'Sleep', description: 'Sleep duration and quality.' },
  { id: 'cognitive', label: 'Cognitive performance', description: 'Reaction-time testing.' },
  { id: 'activity', label: 'Physical activity', description: 'Exercise and strength.' },
  { id: 'behavioral', label: 'Fatigue & behavioral', description: 'Self-report check-ins.' },
  { id: 'vitals', label: 'Clinical vitals', description: 'Oxygen saturation, temperature and glucose.' },
  { id: 'environment', label: 'Space conditions', description: 'The environment the whole crew shares.' },
  { id: 'custom', label: 'Custom', description: 'Indicators you defined.' },
]

type Seed = Omit<WorkspaceIndicator, 'builtin' | 'enabled' | 'scope'> & { enabled?: boolean }

const crew = (s: Seed): WorkspaceIndicator => ({ ...s, scope: 'crew', builtin: true, enabled: s.enabled ?? true })
const env = (s: Seed): WorkspaceIndicator => ({ ...s, scope: 'environment', builtin: true, enabled: s.enabled ?? true })

export const DEFAULT_INDICATORS: WorkspaceIndicator[] = [
  crew({ id: 'restingHR', label: 'Resting heart rate', shortLabel: 'Resting HR', unit: 'bpm', category: 'cardiovascular', decimals: 0, cadenceDays: 1, collection: 'Wearable or manual pulse at rest.', plausibleRange: [30, 130], resolution: 1 }),
  crew({ id: 'hrv', label: 'Heart-rate variability', shortLabel: 'HRV', unit: 'ms', category: 'cardiovascular', decimals: 0, cadenceDays: 1, collection: 'Overnight wearable, RMSSD.', plausibleRange: [5, 200], resolution: 1 }),
  crew({ id: 'systolicBP', label: 'Systolic blood pressure', shortLabel: 'Systolic', unit: 'mmHg', category: 'cardiovascular', decimals: 0, cadenceDays: 1, collection: 'Cuff, seated, after five minutes of rest.', plausibleRange: [60, 220], resolution: 1 }),
  crew({ id: 'diastolicBP', label: 'Diastolic blood pressure', shortLabel: 'Diastolic', unit: 'mmHg', category: 'cardiovascular', decimals: 0, cadenceDays: 1, collection: 'Cuff, seated, after five minutes of rest.', plausibleRange: [35, 140], resolution: 1 }),
  crew({ id: 'sleepDuration', label: 'Sleep duration', shortLabel: 'Sleep', unit: 'h', category: 'sleep', decimals: 1, cadenceDays: 1, collection: 'Actigraphy or sleep log.', plausibleRange: [0, 16], resolution: 0.1 }),
  crew({ id: 'sleepQuality', label: 'Sleep quality index', shortLabel: 'Sleep quality', unit: '/100', category: 'sleep', decimals: 0, cadenceDays: 1, collection: 'Actigraphy composite or self-rating.', plausibleRange: [0, 100], resolution: 1 }),
  crew({ id: 'reactionTime', label: 'Reaction time', shortLabel: 'Reaction time', unit: 'ms', category: 'cognitive', decimals: 0, cadenceDays: 1, collection: 'Psychomotor vigilance test, mean response.', plausibleRange: [120, 1500], resolution: 1 }),
  crew({ id: 'lapses', label: 'Attention lapses', shortLabel: 'Lapses', unit: 'per test', category: 'cognitive', decimals: 0, cadenceDays: 1, collection: 'Responses slower than 500 ms in the vigilance test.', plausibleRange: [0, 80], resolution: 1, enabled: false }),
  crew({ id: 'exerciseMinutes', label: 'Exercise activity', shortLabel: 'Exercise', unit: 'min', category: 'activity', decimals: 0, cadenceDays: 1, collection: 'Exercise log.', plausibleRange: [0, 400], resolution: 1 }),
  crew({ id: 'muscleStrength', label: 'Muscle strength index', shortLabel: 'Strength', unit: '% pre-flight', category: 'activity', decimals: 1, cadenceDays: 7, collection: 'Weekly strength test relative to pre-flight.', plausibleRange: [30, 150], resolution: 0.5, enabled: false }),
  crew({ id: 'fatigue', label: 'Self-reported fatigue', shortLabel: 'Fatigue', unit: '/10', category: 'behavioral', decimals: 1, cadenceDays: 1, collection: 'Daily check-in.', plausibleRange: [0, 10], resolution: 0.1 }),
  crew({ id: 'mood', label: 'Mood check-in', shortLabel: 'Mood', unit: '/10', category: 'behavioral', decimals: 1, cadenceDays: 1, collection: 'Daily check-in.', plausibleRange: [0, 10], resolution: 0.1 }),
  crew({ id: 'stress', label: 'Self-reported stress', shortLabel: 'Stress', unit: '/10', category: 'behavioral', decimals: 1, cadenceDays: 1, collection: 'Daily check-in.', plausibleRange: [0, 10], resolution: 0.1, enabled: false }),
  crew({ id: 'spo2', label: 'Oxygen saturation', shortLabel: 'SpO₂', unit: '%', category: 'vitals', decimals: 0, cadenceDays: 1, collection: 'Pulse oximeter.', plausibleRange: [60, 100], resolution: 1 }),
  crew({ id: 'temperature', label: 'Body temperature', shortLabel: 'Temp', unit: '°C', category: 'vitals', decimals: 1, cadenceDays: 1, collection: 'Thermometer.', plausibleRange: [32, 43], resolution: 0.1 }),
  crew({ id: 'glucose', label: 'Blood glucose', shortLabel: 'Glucose', unit: 'mg/dL', category: 'vitals', decimals: 0, cadenceDays: 1, collection: 'Finger-stick meter.', plausibleRange: [20, 500], resolution: 1, enabled: false }),

  env({ id: 'radiationDose', label: 'Radiation dose', shortLabel: 'Dose', unit: 'mSv/day', category: 'environment', decimals: 2, cadenceDays: 1, collection: 'Area or personal dosimeter, daily effective dose.', plausibleRange: [0, 500], resolution: 0.01 }),
  env({ id: 'cabinCO2', label: 'Cabin CO₂', shortLabel: 'CO₂', unit: 'mmHg', category: 'environment', decimals: 1, cadenceDays: 1, collection: 'Cabin atmosphere monitor, partial pressure.', plausibleRange: [0, 30], resolution: 0.1 }),
  env({ id: 'cabinTemp', label: 'Cabin temperature', shortLabel: 'Cabin temp', unit: '°C', category: 'environment', decimals: 1, cadenceDays: 1, collection: 'Cabin atmosphere monitor.', plausibleRange: [5, 45], resolution: 0.1 }),
  env({ id: 'noise', label: 'Noise level', shortLabel: 'Noise', unit: 'dBA', category: 'environment', decimals: 0, cadenceDays: 1, collection: 'Acoustic dosimeter, 24-hour average.', plausibleRange: [20, 120], resolution: 1 }),
  env({ id: 'cabinHumidity', label: 'Cabin humidity', shortLabel: 'Humidity', unit: '%', category: 'environment', decimals: 0, cadenceDays: 1, collection: 'Cabin atmosphere monitor, relative humidity.', plausibleRange: [0, 100], resolution: 1, enabled: false }),
]

export const CREW_COLORS = ['#7aa7ff', '#ff9153', '#4fd6c0', '#c7a2ff', '#ffb84d', '#ff7a85', '#aacf63', '#6fd3e8']

/** NASA-STD-3001 career effective-dose limit, used as a reference line for cumulative dose. */
export const CAREER_DOSE_LIMIT_MSV = 600
