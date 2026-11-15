// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — analysis pipeline
//
// createMissionAnalysis() is the single entry point. It runs the baseline,
// deviation and joint-pattern stages once for the whole mission, and evaluates
// relationships, responses and insights on demand for any mission day (always
// using only data available on or before that day).
// ---------------------------------------------------------------------------

import type {
  DeviationEpisode,
  IndicatorDayState,
  IndicatorDef,
  IndicatorTimeline,
  Insight,
  JointState,
  MissionDataset,
  PatternEpisode,
  PatternView,
  RecordedAction,
  RelationshipResult,
  ResponseEvaluation,
} from './types'
import { resolveConfig, type DeepPartial, type EngineConfig } from './config'
import { computeIndicatorTimeline, findDeviationEpisodes } from './timeline'
import { buildJointModel, computeJointStates, findPatternEpisodes, viewPattern, type JointModel } from './joint'
import { evaluateRelationships, findRelationship, supportingPairs, type SupportingPair } from './relationships'
import { evaluateResponse } from './response'
import { buildInsights } from './insights'

export interface HistoryPoint {
  day: number
  value: number | null
  z: number | null
  shift: number | null
  status: IndicatorDayState['status']
}

export interface DaySummary {
  day: number
  counts: Record<IndicatorDayState['status'], number>
  activePatterns: number
  jointExceeds: boolean
}

export interface MissionAnalysis {
  dataset: MissionDataset
  config: EngineConfig
  indicators: IndicatorDef[]
  timelines: IndicatorTimeline[]
  jointModel: JointModel
  joint: (JointState | null)[]
  /** Every individual deviation episode in the mission (use `startDay` to filter by day). */
  episodes: DeviationEpisode[]
  /** Every joint pattern episode in the mission. */
  patternEpisodes: PatternEpisode[]
  timelineOf(indicatorId: string): IndicatorTimeline
  stateAt(indicatorId: string, day: number): IndicatorDayState
  statesAt(day: number): IndicatorDayState[]
  jointAt(day: number): JointState | null
  /** Patterns as they would have been reported on `day`. */
  patternsAt(day: number): PatternView[]
  /** All pairwise relationships using data up to `day` (memoised). */
  relationshipsAt(day: number): RelationshipResult[]
  relationshipBetween(a: string, b: string, day: number): RelationshipResult | undefined
  /** The paired, detrended observations behind a relationship result. */
  supportingPairs(result: RelationshipResult): SupportingPair[]
  /** Before/after comparison for any recorded action, including user-entered ones. */
  responseFor(action: RecordedAction, day: number, allActions?: readonly RecordedAction[]): ResponseEvaluation
  insightsAt(day: number, actions?: readonly RecordedAction[]): Insight[]
  history(indicatorId: string, fromDay: number, toDay: number): HistoryPoint[]
  summaryAt(day: number): DaySummary
}

export function createMissionAnalysis(dataset: MissionDataset, config?: DeepPartial<EngineConfig>): MissionAnalysis {
  const cfg = resolveConfig(config)
  const totalDays = dataset.totalDays
  const timelines = dataset.indicators.map((def) => computeIndicatorTimeline(def, dataset.series[def.id] ?? [], totalDays, cfg))
  const byId = new Map(timelines.map((t) => [t.def.id, t]))
  const jointModel = buildJointModel(timelines, cfg)
  const joint = computeJointStates(timelines, jointModel, cfg)
  const episodes = timelines.flatMap((t) => findDeviationEpisodes(t, cfg))
  const patternEpisodes = findPatternEpisodes(joint, cfg)
  const relationshipCache = new Map<number, RelationshipResult[]>()

  const clampDay = (day: number) => Math.min(totalDays, Math.max(1, Math.round(day)))

  const timelineOf = (id: string) => {
    const tl = byId.get(id)
    if (!tl) throw new Error(`Unknown indicator: ${id}`)
    return tl
  }

  const patternsAt = (day: number): PatternView[] => {
    const d = clampDay(day)
    const out: PatternView[] = []
    for (const ep of patternEpisodes) {
      const v = viewPattern(ep, d, timelines, joint, cfg)
      if (v) out.push(v)
    }
    return out
  }

  const relationshipsAt = (day: number): RelationshipResult[] => {
    const d = clampDay(day)
    let r = relationshipCache.get(d)
    if (!r) {
      r = evaluateRelationships(timelines, d, cfg)
      relationshipCache.set(d, r)
    }
    return r
  }

  const responseFor = (action: RecordedAction, day: number, allActions: readonly RecordedAction[] = dataset.actions) =>
    evaluateResponse(action, clampDay(day), timelines, dataset.events, allActions, cfg)

  return {
    dataset,
    config: cfg,
    indicators: dataset.indicators,
    timelines,
    jointModel,
    joint,
    episodes,
    patternEpisodes,
    timelineOf,
    stateAt: (id, day) => timelineOf(id).states[clampDay(day) - 1],
    statesAt: (day) => timelines.map((t) => t.states[clampDay(day) - 1]),
    jointAt: (day) => joint[clampDay(day) - 1],
    patternsAt,
    relationshipsAt,
    relationshipBetween: (a, b, day) => findRelationship(relationshipsAt(day), a, b),
    supportingPairs: (result) => supportingPairs(timelines, result, cfg),
    responseFor,
    insightsAt: (day, actions = dataset.actions) => {
      const d = clampDay(day)
      return buildInsights({
        day: d,
        timelines,
        episodes,
        patterns: patternsAt(d),
        responses: actions.filter((a) => a.day <= d).map((a) => responseFor(a, d, actions)),
        cfg,
      })
    },
    history: (id, fromDay, toDay) => {
      const tl = timelineOf(id)
      const out: HistoryPoint[] = []
      for (let d = clampDay(fromDay); d <= clampDay(toDay); d++) {
        const s = tl.states[d - 1]
        out.push({ day: d, value: s.value, z: s.z, shift: s.shift, status: s.status })
      }
      return out
    },
    summaryAt: (day) => {
      const d = clampDay(day)
      const counts: DaySummary['counts'] = { 'insufficient-data': 0, stale: 0, normal: 0, unusual: 0, drifting: 0, sustained: 0 }
      for (const t of timelines) counts[t.states[d - 1].status]++
      return { day: d, counts, activePatterns: patternsAt(d).filter((p) => p.active).length, jointExceeds: joint[d - 1]?.exceeds ?? false }
    },
  }
}
