import type { IndicatorDef, MissionDataset, MissionEventRecord, RecordedAction } from '../types'
import { createRng } from '../../lib/random'

export function indicator(id: string, category = 'cat-a', overrides: Partial<IndicatorDef> = {}): IndicatorDef {
  return {
    id,
    label: id,
    shortLabel: id,
    unit: 'u',
    category,
    decimals: 1,
    cadenceDays: 1,
    collection: 'test',
    plausibleRange: [-1e6, 1e6],
    resolution: 0.001,
    provenance: 'synthetic-demo',
    ...overrides,
  }
}

export function dataset(
  indicators: IndicatorDef[],
  series: Record<string, (number | null)[]>,
  extra: { events?: MissionEventRecord[]; actions?: RecordedAction[] } = {},
): MissionDataset {
  const totalDays = Math.max(...Object.values(series).map((s) => s.length))
  return {
    id: 'test',
    name: 'test',
    description: 'test dataset',
    subject: { id: 'T-1', name: 'Test Subject', role: 'tester' },
    totalDays,
    categories: [...new Set(indicators.map((i) => i.category))].map((c) => ({ id: c, label: c, description: c })),
    indicators,
    series,
    events: extra.events ?? [],
    actions: extra.actions ?? [],
    provenance: 'synthetic-demo',
  }
}

/** Seeded Gaussian noise series with an optional deterministic component. */
export function noise(n: number, seed: number, mean = 0, sd = 1, shape: (day: number) => number = () => 0): number[] {
  const rng = createRng(seed)
  const out: number[] = []
  for (let d = 1; d <= n; d++) out.push(mean + shape(d) + rng.normal(0, sd))
  return out
}
