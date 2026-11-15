import type { Astronaut, DailyRecord, IndicatorKey, MissionEvent } from '../types'
import type { CategoryDef, IndicatorDef, MissionDataset, MissionEventRecord } from '../engine/types'
import { INDICATORS } from '../lib/indicators'

/**
 * Bridges the main application's data model (DailyRecord per astronaut) to the
 * Constellation Engine's dataset format, so the engine and SIGNAL VEIL can run
 * on any crew member of the Ares Meridiani demonstration mission.
 */

interface AdapterSpec {
  key: IndicatorKey
  category: string
  cadenceDays: number
  plausibleRange: [number, number]
  resolution: number
  collection: string
}

const SPECS: AdapterSpec[] = [
  { key: 'restingHR', category: 'cardiovascular', cadenceDays: 1, plausibleRange: [30, 130], resolution: 1, collection: 'Wearable biosensor, morning resting value.' },
  { key: 'hrv', category: 'cardiovascular', cadenceDays: 1, plausibleRange: [5, 200], resolution: 1, collection: 'Wearable biosensor, overnight RMSSD.' },
  { key: 'sleepDuration', category: 'sleep', cadenceDays: 1, plausibleRange: [1, 14], resolution: 0.1, collection: 'Wrist actigraphy estimate.' },
  { key: 'sleepQuality', category: 'sleep', cadenceDays: 1, plausibleRange: [0, 100], resolution: 1, collection: 'Composite of actigraphy efficiency and self-report.' },
  { key: 'exerciseMinutes', category: 'activity', cadenceDays: 1, plausibleRange: [0, 300], resolution: 1, collection: 'Exercise hardware log.' },
  { key: 'fatigue', category: 'behavioral', cadenceDays: 1, plausibleRange: [0, 10], resolution: 0.1, collection: 'Daily self-report check-in.' },
  { key: 'stress', category: 'behavioral', cadenceDays: 1, plausibleRange: [0, 10], resolution: 0.1, collection: 'Daily self-report check-in.' },
  { key: 'mood', category: 'behavioral', cadenceDays: 1, plausibleRange: [0, 10], resolution: 0.1, collection: 'Daily self-report check-in.' },
]

export const ARES_CATEGORIES: CategoryDef[] = [
  { id: 'cardiovascular', label: 'Cardiovascular', description: 'Resting heart rate and heart-rate variability.' },
  { id: 'sleep', label: 'Sleep', description: 'Sleep duration and quality.' },
  { id: 'activity', label: 'Physical activity', description: 'Logged exercise.' },
  { id: 'behavioral', label: 'Fatigue & behavioral', description: 'Self-reported fatigue, stress and mood.' },
]

const KIND: Record<MissionEvent['type'], MissionEventRecord['kind']> = {
  milestone: 'operations',
  radiation: 'environment',
  systems: 'systems',
  operations: 'operations',
  medical: 'medical',
  communications: 'operations',
  environment: 'environment',
}

/** Build an engine dataset for one crew member from the application's daily records. */
export function datasetFromDailyRecords(records: readonly DailyRecord[], astronaut: Astronaut, events: readonly MissionEvent[], totalDays: number): MissionDataset {
  const mine = records.filter((r) => r.astronautId === astronaut.id)
  const indicators: IndicatorDef[] = SPECS.map((s) => {
    const meta = INDICATORS[s.key]
    return {
      id: s.key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      unit: meta.unit,
      category: s.category,
      decimals: meta.decimals,
      cadenceDays: s.cadenceDays,
      collection: s.collection,
      plausibleRange: s.plausibleRange,
      resolution: s.resolution,
      provenance: 'synthetic-demo',
    }
  })
  const series: Record<string, (number | null)[]> = {}
  for (const s of SPECS) series[s.key] = new Array(totalDays).fill(null)
  for (const r of mine) {
    if (r.day < 1 || r.day > totalDays) continue
    for (const s of SPECS) series[s.key][r.day - 1] = r[s.key]
  }
  return {
    id: `ares-${astronaut.id}`,
    name: 'Ares Meridiani',
    description: 'Crew member of the main AURORA demonstration mission. All measurements are synthetic.',
    subject: { id: astronaut.id, name: astronaut.name, role: astronaut.role },
    totalDays,
    categories: ARES_CATEGORIES,
    indicators,
    series,
    events: events
      .filter((e) => e.day <= totalDays)
      .map((e) => ({ id: e.id, day: e.day, endDay: e.endDay, title: e.title, description: e.description, kind: KIND[e.type] })),
    actions: [],
    provenance: 'synthetic-demo',
  }
}
