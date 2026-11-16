import { createMissionAnalysis, type MissionAnalysis } from '../engine/analysis'
import type { CategoryDef, IndicatorDef, MissionDataset, MissionEventRecord } from '../engine/types'
import { eventsDuring } from './engine'
import { EVENT_TYPE_BY_ID } from './events'
import { EFFECT_BY_ID, ENV_PARAMS, SIM_INDICATORS, SIM_INDICATOR_BY_ID } from './reference'
import type { AstronautRun, MissionConfig, MissionEvent, SimIndicator, SimulationResult } from './types'

/**
 * Detection and explanation for simulated missions.
 *
 * Detection reuses the Constellation Engine unchanged: each astronaut's
 * simulated daily series (plus the cabin environment as context) become an
 * engine dataset. Explanation is what simulation adds: because every modeled
 * change is recorded, each alert can name the effects and assumptions behind it.
 */

const CATEGORIES: CategoryDef[] = [
  { id: 'cardiovascular', label: 'Cardiovascular', description: 'Heart rate and variability.' },
  { id: 'vitals', label: 'Vitals', description: 'Breathing, saturation and temperature.' },
  { id: 'sleep', label: 'Sleep', description: 'Duration and quality.' },
  { id: 'activity', label: 'Activity', description: 'Exercise and movement.' },
  { id: 'behavioral', label: 'Workload & behavioral', description: 'Modeled workload, stress and fatigue.' },
  { id: 'radiation', label: 'Radiation', description: 'Daily dose.' },
  { id: 'environment', label: 'Cabin environment', description: 'Shared conditions.' },
]

/** Indicators fed to the engine. Workload is a scheduled input, not an outcome, so it is shown but not analysed. */
const ANALYSED: SimIndicator[] = ['restingHR', 'hrv', 'systolicBP', 'respRate', 'spo2', 'bodyTemp', 'sleepDuration', 'sleepQuality', 'activityMinutes', 'exerciseMinutes', 'muscleStrength', 'stress', 'mood', 'fatigue', 'pvtLapses', 'radiationDose']

export function datasetForAstronaut(config: MissionConfig, result: SimulationResult, astronautId: string): MissionDataset {
  const run = result.astronauts.find((r) => r.astronautId === astronautId)
  const person = config.crew.find((c) => c.id === astronautId)
  if (!run || !person) throw new Error(`No simulation output for ${astronautId}`)
  const indicators: IndicatorDef[] = []
  const series: Record<string, (number | null)[]> = {}
  for (const id of ANALYSED) {
    const d = SIM_INDICATOR_BY_ID[id]
    indicators.push({
      id,
      label: d.label,
      shortLabel: d.shortLabel,
      unit: d.unit,
      category: d.category,
      decimals: d.decimals,
      cadenceDays: 1,
      collection: d.kind === 'measured' ? 'Simulated value of a measurable indicator.' : 'Simulated modeled estimate (no direct sensor).',
      plausibleRange: d.plausible,
      resolution: d.resolution,
      provenance: 'synthetic-demo',
      role: id === 'radiationDose' ? 'context' : 'health',
    })
    series[id] = Array.from(run.daily[id])
  }
  // Environment variables that actually vary become context for relationship tests.
  for (const p of ENV_PARAMS) {
    const arr = result.environment[p.key]
    let lo = Infinity
    let hi = -Infinity
    for (const v of arr) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    if (hi - lo < 1e-6) continue
    indicators.push({ id: `env.${p.key}`, label: p.label, shortLabel: p.label, unit: p.unit, category: 'environment', decimals: p.decimals, cadenceDays: 1, collection: 'Simulated cabin condition.', plausibleRange: [p.min, p.max], resolution: p.step, provenance: 'synthetic-demo', role: 'context' })
    series[`env.${p.key}`] = Array.from(arr)
  }
  const events: MissionEventRecord[] = config.events
    .filter((e) => e.crewWide || e.astronautIds.includes(astronautId))
    .map((e) => ({ id: e.id, day: e.startDay, endDay: e.durationDays > 1 ? e.startDay + e.durationDays - 1 : undefined, title: e.title, description: e.notes || EVENT_TYPE_BY_ID[e.type].description, kind: e.type === 'environment-anomaly' || e.type === 'noise-change' || e.type === 'solar-particle-event' ? 'environment' : e.type === 'sleep-disruption' || e.type === 'lighting-change' ? 'schedule' : 'operations' }))
  return {
    id: `${config.id}:${astronautId}`,
    name: config.name,
    description: config.description,
    subject: { id: person.id, name: person.name, role: person.role },
    totalDays: result.days,
    categories: CATEGORIES.filter((c) => indicators.some((i) => i.category === c.id)),
    indicators,
    series,
    events,
    actions: [],
    provenance: 'synthetic-demo',
  }
}

export function analysisConfig(days: number) {
  return { baseline: { mode: days > 240 ? ('rolling' as const) : ('reference' as const), referenceDays: Math.min(30, Math.max(14, Math.round(days * 0.25))) } }
}

export function analyzeAstronaut(config: MissionConfig, result: SimulationResult, astronautId: string): MissionAnalysis {
  return createMissionAnalysis(datasetForAstronaut(config, result, astronautId), analysisConfig(result.days))
}

// ------------------------------------------------------------------ alerts

export type AlertLevel = 'monitoring-alert' | 'unusual-trend' | 'pattern-requiring-investigation'

export const ALERT_LABEL: Record<AlertLevel, string> = {
  'monitoring-alert': 'Monitoring alert',
  'unusual-trend': 'Unusual trend',
  'pattern-requiring-investigation': 'Pattern requiring investigation',
}

export interface EffectShare {
  effectId: string
  label: string
  basis: 'established' | 'simplified'
  source: string
  indicator: SimIndicator
  /** Mean modeled change over the alert window, in indicator units. */
  meanDelta: number
}

export interface SimAlert {
  id: string
  level: AlertLevel
  astronautId: string
  indicators: string[]
  startDay: number
  detectedDay: number
  endDay: number
  active: boolean
  explanation: string
  supporting: { indicator: string; label: string; unit: string; baseline: number | null; recent: number | null; percentChange: number | null }[]
  events: MissionEvent[]
  effects: EffectShare[]
  evidence: string
}

function effectsBehind(run: AstronautRun, indicators: string[], from: number, to: number): EffectShare[] {
  const out: EffectShare[] = []
  for (const c of run.contributions) {
    if (!indicators.includes(c.indicator)) continue
    let sum = 0
    let n = 0
    for (let d = from; d <= to; d++) {
      sum += c.daily[d - 1]
      n++
    }
    const mean = n ? sum / n : 0
    const def = SIM_INDICATOR_BY_ID[c.indicator]
    // Ignore effects too small to matter at the indicator's display precision.
    if (Math.abs(mean) < Math.max(def.resolution, 1e-3)) continue
    const e = EFFECT_BY_ID[c.effectId]
    out.push({ effectId: c.effectId, label: e?.label ?? c.effectId, basis: e?.basis ?? 'simplified', source: e?.source ?? '', indicator: c.indicator, meanDelta: mean })
  }
  return out.sort((a, b) => Math.abs(b.meanDelta) / SIM_INDICATOR_BY_ID[b.indicator].resolution - Math.abs(a.meanDelta) / SIM_INDICATOR_BY_ID[a.indicator].resolution)
}

/** All alerts for one astronaut, as they would stand on `asOfDay`. */
export function alertsFor(config: MissionConfig, result: SimulationResult, analysis: MissionAnalysis, astronautId: string, asOfDay = result.days): SimAlert[] {
  const run = result.astronauts.find((r) => r.astronautId === astronautId)!
  const alerts: SimAlert[] = []
  const label = (id: string) => analysis.timelineOf(id).def

  const supporting = (ids: string[]) =>
    ids.map((id) => {
      const s = analysis.stateAt(id, asOfDay)
      const d = label(id)
      return { indicator: id, label: d.label, unit: d.unit, baseline: s.baseline && s.baseline.status !== 'insufficient' ? s.baseline.median : null, recent: s.recentMedian, percentChange: s.percentChange }
    })

  for (const ep of analysis.patternEpisodes) {
    if (ep.detectedDay > asOfDay) continue
    const view = analysis.patternsAt(asOfDay).find((p) => p.id === ep.id)
    if (!view) continue
    const ids = view.coreMemberIds
    const end = Math.min(asOfDay, ep.endDay)
    const events = eventsDuring(config, astronautId, ep.startDay - 3, end)
    const effects = effectsBehind(run, ids, ep.startDay, end)
    alerts.push({
      id: `${astronautId}:${ep.id}`,
      level: 'pattern-requiring-investigation',
      astronautId,
      indicators: ids,
      startDay: ep.startDay,
      detectedDay: ep.detectedDay,
      endDay: end,
      active: view.active,
      explanation: `${ids.length} indicators (${ids.map((i) => label(i).label.toLowerCase()).join(', ')}) moved away from this astronaut's baseline at the same time from day ${ep.startDay}, and the combination exceeded the joint statistical limit for ${view.durationDays} days. ${events.length ? `It overlaps ${events.map((e) => `"${e.title}"`).join(', ')}.` : 'No scheduled event overlaps it.'}`,
      supporting: supporting(ids),
      events,
      effects,
      evidence: `${view.strength[0].toUpperCase()}${view.strength.slice(1)} statistical evidence of departure from baseline. Simulated data; not a diagnosis.`,
    })
  }

  for (const ep of analysis.episodes) {
    if (ep.startDay > asOfDay || isContext(analysis, ep.indicatorId)) continue
    const end = Math.min(asOfDay, ep.endDay)
    const ids = [ep.indicatorId]
    const events = eventsDuring(config, astronautId, ep.startDay - 3, end)
    alerts.push({
      id: `${astronautId}:${ep.id}`,
      level: ep.sustained ? 'unusual-trend' : 'monitoring-alert',
      astronautId,
      indicators: ids,
      startDay: ep.startDay,
      detectedDay: ep.startDay,
      endDay: end,
      active: ep.endDay >= asOfDay - 2,
      explanation: `${label(ep.indicatorId).label} ${ep.sustained ? 'stayed' : 'moved'} ${ep.direction} this astronaut's baseline from day ${ep.startDay}${ep.endDay < asOfDay ? ` to day ${ep.endDay}` : ''} (peak smoothed shift ${ep.peakShift.toFixed(1)} control-limit units on day ${ep.peakDay}). ${events.length ? `Coinciding events: ${events.map((e) => `"${e.title}"`).join(', ')}.` : 'No scheduled event coincides.'}`,
      supporting: supporting(ids),
      events,
      effects: effectsBehind(run, ids, ep.startDay, end),
      evidence: ep.sustained ? 'Persistent departure from personal baseline.' : 'Brief departure; may be ordinary variation.',
    })
  }
  const rank: Record<AlertLevel, number> = { 'pattern-requiring-investigation': 0, 'unusual-trend': 1, 'monitoring-alert': 2 }
  return alerts.sort((a, b) => (a.active === b.active ? rank[a.level] - rank[b.level] || b.startDay - a.startDay : a.active ? -1 : 1))
}

function isContext(analysis: MissionAnalysis, id: string): boolean {
  return analysis.timelineOf(id).def.role === 'context'
}

// --------------------------------------------------------------- summaries

export interface IndicatorSummary {
  indicator: SimIndicator
  baseline: number
  mean: number
  min: number
  max: number
  last: number
  /** Mean over the final 7 days minus the first 7 days. */
  change: number
}

export function summarise(run: AstronautRun, baseline: Record<string, number>): IndicatorSummary[] {
  return SIM_INDICATORS.map((d) => {
    const arr = run.daily[d.id]
    let sum = 0
    let lo = Infinity
    let hi = -Infinity
    for (const v of arr) {
      sum += v
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    const k = Math.min(7, arr.length)
    let first = 0
    let last = 0
    for (let i = 0; i < k; i++) {
      first += arr[i]
      last += arr[arr.length - 1 - i]
    }
    return { indicator: d.id, baseline: baseline[d.id] ?? NaN, mean: sum / arr.length, min: lo, max: hi, last: arr[arr.length - 1], change: (last - first) / k }
  })
}
