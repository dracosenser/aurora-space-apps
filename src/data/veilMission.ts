import type { CategoryDef, IndicatorDef, MissionDataset, MissionEventRecord, RecordedAction } from '../engine/types'
import { createRng } from '../lib/random'

/**
 * SIGNAL VEIL demonstration mission.
 *
 * A deterministic, fictional 150-day expedition for one crew member. Every
 * value is SYNTHETIC. The generator plants a coherent story so the
 * Constellation Engine has something real to find:
 *
 *   days   1–40   stable baseline
 *   days  41–75   a slow workload ramp begins to move several indicators
 *   days  76–100  the shifts overlap; each is modest on its own
 *   days 101–120  the pattern persists and is reviewed
 *   day  121      the crew member records a protocol-approved action
 *   days 122–150  measurements evolve; a second action is recorded on day 145
 *
 * Day-to-day couplings are also planted (previous night's sleep → next-day
 * fatigue and reaction time; resting heart rate ↔ HRV; fatigue ↔ mood), and
 * some pairs are deliberately left unrelated (exercise minutes vs anything),
 * so the relationship tests have true positives and true negatives to find.
 *
 * Magnitudes are loosely informed by published spaceflight findings (see
 * docs/NASA_DATA.md) but no value here is a real measurement.
 */

export const VEIL_TOTAL_DAYS = 150
export const VEIL_ACTION_DAY = 121
const SEED = 20263831

/** Engine settings used for this demonstration: three-week comparison windows around a recorded action. */
export const VEIL_ENGINE_CONFIG = { response: { preDays: 21, postDays: 21 } } as const

export const VEIL_CATEGORIES: CategoryDef[] = [
  { id: 'cardiovascular', label: 'Cardiovascular', description: 'Resting heart rate and heart-rate variability from an overnight wearable.' },
  { id: 'sleep', label: 'Sleep', description: 'Wrist actigraphy estimates of sleep duration and quality.' },
  { id: 'cognitive', label: 'Cognitive performance', description: 'A short self-administered reaction-time test.' },
  { id: 'activity', label: 'Physical activity', description: 'Exercise log and a periodic strength test.' },
  { id: 'behavioral', label: 'Fatigue & behavioral', description: 'Daily self-report check-ins.' },
]

export const VEIL_INDICATORS: IndicatorDef[] = [
  { id: 'restingHR', label: 'Resting heart rate', shortLabel: 'Resting HR', unit: 'bpm', category: 'cardiovascular', decimals: 0, cadenceDays: 1, collection: 'Overnight wearable biosensor, lowest stable 5-minute average.', plausibleRange: [30, 130], resolution: 1, provenance: 'synthetic-demo' },
  { id: 'hrv', label: 'Heart-rate variability', shortLabel: 'HRV', unit: 'ms', category: 'cardiovascular', decimals: 0, cadenceDays: 1, collection: 'Overnight wearable biosensor, RMSSD.', plausibleRange: [5, 200], resolution: 1, provenance: 'synthetic-demo' },
  { id: 'sleepDuration', label: 'Sleep duration', shortLabel: 'Sleep', unit: 'h', category: 'sleep', decimals: 1, cadenceDays: 1, collection: 'Wrist actigraphy estimate of total sleep time.', plausibleRange: [1, 14], resolution: 0.1, provenance: 'synthetic-demo' },
  { id: 'sleepQuality', label: 'Sleep quality index', shortLabel: 'Sleep quality', unit: '/100', category: 'sleep', decimals: 0, cadenceDays: 1, collection: 'Composite of actigraphy sleep efficiency and awakenings.', plausibleRange: [0, 100], resolution: 1, provenance: 'synthetic-demo' },
  { id: 'reactionTime', label: 'Reaction time', shortLabel: 'Reaction time', unit: 'ms', category: 'cognitive', decimals: 0, cadenceDays: 1, collection: 'Self-administered 5-minute psychomotor vigilance test; sessions are sometimes skipped.', plausibleRange: [150, 900], resolution: 1, provenance: 'synthetic-demo' },
  { id: 'lapses', label: 'Attention lapses', shortLabel: 'Lapses', unit: 'per test', category: 'cognitive', decimals: 0, cadenceDays: 1, collection: 'Responses slower than 500 ms in the same vigilance test.', plausibleRange: [0, 60], resolution: 1, provenance: 'synthetic-demo' },
  { id: 'exerciseMinutes', label: 'Exercise activity', shortLabel: 'Exercise', unit: 'min', category: 'activity', decimals: 0, cadenceDays: 1, collection: 'Exercise hardware log (resistive and aerobic sessions).', plausibleRange: [0, 300], resolution: 1, provenance: 'synthetic-demo' },
  { id: 'muscleStrength', label: 'Muscle strength index', shortLabel: 'Strength', unit: '% pre-flight', category: 'activity', decimals: 1, cadenceDays: 7, collection: 'Weekly strength test on the resistive device, relative to pre-flight.', plausibleRange: [40, 130], resolution: 0.5, provenance: 'synthetic-demo' },
  { id: 'fatigue', label: 'Self-reported fatigue', shortLabel: 'Fatigue', unit: '/10', category: 'behavioral', decimals: 1, cadenceDays: 1, collection: 'Daily check-in question answered by the crew member.', plausibleRange: [0, 10], resolution: 0.1, provenance: 'synthetic-demo' },
  { id: 'mood', label: 'Mood check-in', shortLabel: 'Mood', unit: '/10', category: 'behavioral', decimals: 1, cadenceDays: 1, collection: 'Daily check-in question answered by the crew member.', plausibleRange: [0, 10], resolution: 0.1, provenance: 'synthetic-demo' },
]

export const VEIL_EVENTS: MissionEventRecord[] = [
  { id: 'v-arrive', day: 1, title: 'Arrival and handover', kind: 'operations', description: 'Docking, crew handover and start of the expedition routine.' },
  { id: 'v-eva', day: 23, title: 'EVA-2', kind: 'operations', description: 'External maintenance spacewalk, 6 h 40 min.' },
  { id: 'v-cargo', day: 41, endDay: 100, title: 'Cargo campaign: compressed timeline', kind: 'schedule', description: 'Two visiting vehicles and a backlog of payload work compress the daily schedule.' },
  { id: 'v-shift', day: 76, endDay: 84, title: 'Sleep period shifted for docking operations', kind: 'schedule', description: 'Scheduled sleep moved three hours earlier to match vehicle arrival.' },
  { id: 'v-treadmill', day: 97, endDay: 98, title: 'Treadmill maintenance', kind: 'systems', description: 'Aerobic exercise unavailable for two days.' },
  { id: 'v-pmc', day: 104, title: 'Private medical conference', kind: 'medical', description: 'Scheduled conference with the ground flight surgeon.' },
  { id: 'v-sensor', day: 110, endDay: 114, title: 'Wearable sensor offline', kind: 'systems', description: 'Charging-dock fault; no overnight heart-rate data for five days.' },
  { id: 'v-depart', day: 127, endDay: 132, title: 'Cargo vehicle departed: lighter timeline', kind: 'schedule', description: 'Workload eases after vehicle departure.' },
]

export const VEIL_ACTIONS: RecordedAction[] = [
  {
    id: 'act-sleep',
    day: VEIL_ACTION_DAY,
    label: 'Sleep-schedule protocol started',
    protocol: 'Mission protocol SLP-2 (fictional): protected sleep opportunity and lighting schedule',
    targetIndicators: ['sleepDuration', 'sleepQuality', 'fatigue', 'reactionTime'],
    notes: 'Recorded by the crew member as completed.',
    provenance: 'synthetic-demo',
  },
  {
    id: 'act-exercise',
    day: 145,
    label: 'Exercise session block adjusted',
    protocol: 'Mission protocol EXC-1 (fictional): revised weekly exercise block',
    targetIndicators: ['exerciseMinutes', 'muscleStrength', 'restingHR'],
    notes: 'Recorded by the crew member as completed.',
    provenance: 'synthetic-demo',
  },
]

/** Workload driver, 0 (baseline) to 1 (peak). */
function workload(day: number): number {
  if (day <= 40) return 0
  if (day <= 75) return (0.55 * (day - 40)) / 35
  if (day <= 82) return 0.55 + (0.45 * (day - 75)) / 7
  return 1
}

function recovery(day: number, start: number, tau: number): number {
  return day <= start ? 1 : Math.exp(-(day - start) / tau)
}

const round = (v: number, d: number) => {
  const f = Math.pow(10, d)
  return Math.round(v * f) / f
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function generateVeilMission(seed: number = SEED): MissionDataset {
  const rng = createRng(seed)
  const n = VEIL_TOTAL_DAYS
  const series: Record<string, (number | null)[]> = {}
  for (const def of VEIL_INDICATORS) series[def.id] = new Array(n).fill(null)

  let sleepNoise = 0
  let prevSleepNoise = 0
  let hrNoise = 0

  for (let day = 1; day <= n; day++) {
    const i = day - 1
    // Latent drivers. Sleep responds first; other systems follow with a lag.
    const S = workload(day) * recovery(day, VEIL_ACTION_DAY, 4)
    const F = workload(day - 3) * recovery(day, VEIL_ACTION_DAY + 2, 7)
    const C = workload(day - 5) * recovery(day, VEIL_ACTION_DAY + 3, 8)
    const H = workload(day - 6) * recovery(day, VEIL_ACTION_DAY + 4, 9)

    prevSleepNoise = sleepNoise
    sleepNoise = 0.25 * sleepNoise + rng.normal(0, 0.44)
    hrNoise = 0.3 * hrNoise + rng.normal(0, 2.3)

    // Sleep (actigraphy). Two nights lost to device charging.
    const sleepMissing = day === 58 || day === 59
    const sleepDuration = 6.9 - 0.5 * S + sleepNoise
    const sleepQuality = 78 - 6 * S + 9 * sleepNoise + rng.normal(0, 4.2)
    if (!sleepMissing) {
      series.sleepDuration[i] = round(clamp(sleepDuration, 3, 10), 1)
      series.sleepQuality[i] = round(clamp(sleepQuality, 20, 100), 0)
    }

    // Self-report. Fatigue carries yesterday's sleep; mood follows fatigue.
    const fatigueFluct = -0.9 * prevSleepNoise + rng.normal(0, 0.42)
    series.fatigue[i] = round(clamp(3.4 + 0.62 * F + fatigueFluct, 1, 10), 1)
    series.mood[i] = round(clamp(7.3 - 0.5 * F - 0.6 * fatigueFluct + rng.normal(0, 0.38), 1, 10), 1)

    // Vigilance test. Sessions are skipped more often when the timeline is crowded.
    const rtNoise = -14 * prevSleepNoise + rng.normal(0, 16)
    const lapseNoise = rng.normal(0, 0.9)
    const skipped = rng.next() < 0.12 + (workload(day) > 0.8 ? 0.08 : 0)
    if (!skipped) {
      series.reactionTime[i] = round(clamp(268 + 22 * C + rtNoise, 180, 600), 0)
      series.lapses[i] = Math.round(clamp(1.7 + 1.6 * C + 0.07 * rtNoise + lapseNoise, 0, 30))
    }

    // Wearable. Offline days 110–114; one sensor glitch on day 67; EVA on day 23.
    const wearableOffline = day >= 110 && day <= 114
    const hrvDrop = rng.next() < 0.05
    const hrvNoise = rng.normal(0, 4.5)
    if (!wearableOffline) {
      const rhr = 57 + 3.2 * H + hrNoise + (day === 23 ? 9 : 0)
      series.restingHR[i] = day === 67 ? 0 : round(clamp(rhr, 38, 110), 0)
      if (!hrvDrop) series.hrv[i] = round(clamp(64 - 6 * H - 1.4 * hrNoise + hrvNoise, 15, 140), 0)
    }

    // Exercise log: independent of the story except for two maintenance days.
    const exNoise = rng.normal(0, 9)
    series.exerciseMinutes[i] = round(clamp((92 + exNoise) * (day === 97 || day === 98 ? 0.45 : 1), 0, 180), 0)

    // Weekly strength test: a slow, expected adaptation.
    const strengthNoise = rng.normal(0, 0.45)
    if (day % 7 === 3) series.muscleStrength[i] = round(100 - 0.012 * day + strengthNoise, 1)
  }

  return {
    id: 'veil-demo-150',
    name: 'Selene-3 expedition',
    description: 'A fictional 150-day lunar-orbit expedition used to demonstrate SIGNAL VEIL. All measurements are synthetic.',
    subject: { id: 'SV-01', name: 'Noa Ilves', role: 'Flight Engineer' },
    totalDays: n,
    categories: VEIL_CATEGORIES,
    indicators: VEIL_INDICATORS,
    series,
    events: VEIL_EVENTS,
    actions: VEIL_ACTIONS,
    provenance: 'synthetic-demo',
  }
}
