import type { DeepPartial, EngineConfig } from '../engine/config'
import type { IndicatorDef, MissionDataset, MissionEventRecord, Provenance } from '../engine/types'
import { CAREER_DOSE_LIMIT_MSV, WORKSPACE_CATEGORIES } from './catalog'
import { ENV_SUBJECT, type ReadingRow, type Workspace, type WorkspaceIndicator } from './types'

/**
 * Bridges a user-defined Workspace to the Constellation Engine, and derives
 * the summaries the Workbench shows. Pure functions.
 */

/** One series as the engine expects it: index = day - 1, null where nothing was logged. */
export function seriesFor(ws: Workspace, subject: string, indicatorId: string, days = ws.mission.currentDay): (number | null)[] {
  const out: (number | null)[] = new Array(days).fill(null)
  const series = ws.readings[subject]?.[indicatorId]
  if (!series) return out
  for (const key of Object.keys(series)) {
    const day = Number(key)
    if (day >= 1 && day <= days) out[day - 1] = series[day]
  }
  return out
}

export function hasData(ws: Workspace, subject: string, indicatorId: string): boolean {
  const series = ws.readings[subject]?.[indicatorId]
  return !!series && Object.keys(series).length > 0
}

function toDef(ind: WorkspaceIndicator, provenance: Provenance): IndicatorDef {
  return {
    id: ind.id,
    label: ind.label,
    shortLabel: ind.shortLabel,
    unit: ind.unit,
    category: ind.category,
    decimals: ind.decimals,
    cadenceDays: ind.cadenceDays,
    collection: ind.collection,
    plausibleRange: ind.plausibleRange,
    resolution: ind.resolution,
    provenance,
    role: ind.scope === 'environment' ? 'context' : 'health',
  }
}

/** The most cautious label that covers every series in a dataset. */
function overallProvenance(all: Provenance[]): Provenance {
  if (all.includes('synthetic-demo')) return 'synthetic-demo'
  if (all.includes('imported')) return 'imported'
  return 'user-entered'
}

/**
 * Engine dataset for one crew member: their own measurements plus the shared
 * space conditions, with mission phases and events as context.
 */
export function datasetForCrew(ws: Workspace, crewId: string): MissionDataset | null {
  const member = ws.crew.find((c) => c.id === crewId)
  if (!member) return null
  const days = ws.mission.currentDay
  const indicators: IndicatorDef[] = []
  const series: Record<string, (number | null)[]> = {}
  const provs: Provenance[] = []
  for (const ind of ws.indicators) {
    const subject = ind.scope === 'environment' ? ENV_SUBJECT : crewId
    if (!hasData(ws, subject, ind.id)) continue
    const prov = ws.provenance[subject]?.[ind.id] ?? 'user-entered'
    provs.push(prov)
    indicators.push(toDef(ind, prov))
    series[ind.id] = seriesFor(ws, subject, ind.id, days)
  }
  const phaseEvents: MissionEventRecord[] = ws.phases
    .filter((p) => p.startDay <= days)
    .map((p) => ({ id: `phase-${p.id}`, day: p.startDay, endDay: Math.min(days, p.endDay), title: `Phase: ${p.name}`, description: `Gravity ${p.gravity} g.`, kind: 'environment' as const }))
  const used = new Set(indicators.map((i) => i.category))
  return {
    id: `workspace-${crewId}`,
    name: ws.mission.name,
    description: ws.mission.destination ? `Destination: ${ws.mission.destination}.` : 'A mission defined in the Workbench.',
    subject: { id: member.id, name: member.name, role: member.role },
    totalDays: days,
    categories: WORKSPACE_CATEGORIES.filter((c) => used.has(c.id)),
    indicators,
    series,
    events: [...ws.events.filter((e) => e.day <= days), ...phaseEvents].sort((a, b) => a.day - b.day),
    actions: (ws.actions[crewId] ?? []).filter((a) => a.day <= days),
    provenance: provs.length ? overallProvenance(provs) : 'user-entered',
  }
}

/**
 * Engine settings suited to the amount of data. A short record uses a
 * proportionally shorter baseline window; a long one follows slow adaptation.
 */
export function engineConfigFor(ws: Workspace): DeepPartial<EngineConfig> {
  const days = ws.mission.currentDay
  const mode = ws.baseline === 'auto' ? (days > 200 ? 'rolling' : 'reference') : ws.baseline
  const referenceDays = Math.min(40, Math.max(14, Math.round(days * 0.35)))
  return { baseline: { mode, referenceDays } }
}

export interface SeriesSummary {
  indicatorId: string
  count: number
  firstDay: number | null
  lastDay: number | null
  latest: number | null
  mean: number | null
  implausible: number
}

export function summariseSeries(ws: Workspace, subject: string, ind: WorkspaceIndicator): SeriesSummary {
  const series = ws.readings[subject]?.[ind.id] ?? {}
  const days = Object.keys(series)
    .map(Number)
    .sort((a, b) => a - b)
  let sum = 0
  let implausible = 0
  for (const d of days) {
    sum += series[d]
    if (series[d] < ind.plausibleRange[0] || series[d] > ind.plausibleRange[1]) implausible++
  }
  return {
    indicatorId: ind.id,
    count: days.length,
    firstDay: days.length ? days[0] : null,
    lastDay: days.length ? days[days.length - 1] : null,
    latest: days.length ? series[days[days.length - 1]] : null,
    mean: days.length ? sum / days.length : null,
    implausible,
  }
}

export interface RadiationSummary {
  loggedDays: number
  /** Sum of the logged daily doses, in mSv. */
  cumulative: number
  meanRate: number | null
  /** Cumulative dose if the mean logged rate continued to the planned end. An extrapolation. */
  projected: number | null
  limit: number
  fractionOfLimit: number
  peakDay: number | null
  peakDose: number | null
}

/** Cumulative dose from the logged daily radiation readings, against the 600 mSv career limit. */
export function radiationSummary(ws: Workspace): RadiationSummary {
  const series = ws.readings[ENV_SUBJECT]?.radiationDose ?? {}
  let cumulative = 0
  let loggedDays = 0
  let peakDay: number | null = null
  let peakDose: number | null = null
  for (const key of Object.keys(series)) {
    const day = Number(key)
    const v = series[day]
    if (day > ws.mission.currentDay || !Number.isFinite(v) || v < 0) continue
    cumulative += v
    loggedDays++
    if (peakDose === null || v > peakDose) {
      peakDose = v
      peakDay = day
    }
  }
  const meanRate = loggedDays ? cumulative / loggedDays : null
  // Days without a reading are not assumed to be zero: the projection uses the mean logged rate for all of them.
  const projected = meanRate !== null ? meanRate * ws.mission.totalDays : null
  return { loggedDays, cumulative, meanRate, projected, limit: CAREER_DOSE_LIMIT_MSV, fractionOfLimit: cumulative / CAREER_DOSE_LIMIT_MSV, peakDay, peakDose }
}

/** Which Workbench indicator each Self-Assessment reading maps to. */
export const SELF_CHECK_MAP: Record<string, string> = {
  systolic: 'systolicBP',
  diastolic: 'diastolicBP',
  heartRate: 'restingHR',
  spo2: 'spo2',
  temperature: 'temperature',
  glucose: 'glucose',
  sleepHours: 'sleepDuration',
  mood: 'mood',
}

/**
 * Turn Self-Assessment readings into Workbench rows for one crew member.
 * The Self-Assessment page logs against the demonstration mission's day, so the
 * most recent reading is anchored to `anchorDay` and earlier ones keep their spacing.
 * Readings with no Workbench equivalent, or that would fall before day 1, are skipped.
 */
export function selfCheckRows(readings: readonly { id: string; value: number; day: number }[], crewId: string, anchorDay: number): ReadingRow[] {
  const usable = readings.filter((r) => SELF_CHECK_MAP[r.id] && Number.isFinite(r.value) && Number.isInteger(r.day))
  if (usable.length === 0) return []
  const latest = Math.max(...usable.map((r) => r.day))
  const rows: ReadingRow[] = []
  for (const r of usable) {
    const day = anchorDay - (latest - r.day)
    if (day < 1) continue
    rows.push({ subject: crewId, indicatorId: SELF_CHECK_MAP[r.id], day, value: r.value })
  }
  return rows
}
