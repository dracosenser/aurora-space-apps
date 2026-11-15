import type { IndicatorStatus, MissionEventRecord, PatternStage, RecordedAction, RelationshipStatus } from '../../../engine/types'
import type { MissionAnalysis } from '../../../engine/analysis'
import { describeDay } from '../../../engine/explain'

/**
 * The per-day visual model consumed by the renderer.
 *
 * Everything the constellation shows is derived here from Constellation Engine
 * results. The renderer receives this plain structure and contains no
 * statistics of its own.
 */

export interface NodeSnapshot {
  id: string
  status: IndicatorStatus
  /** Smoothed deviation in control-limit units, or null without a baseline. */
  shift: number | null
  /** 0–1 visual intensity derived from |shift|. */
  intensity: number
  direction: 'above' | 'below' | 'none'
  /** Whether a reading was recorded on this exact day. */
  observedToday: boolean
  rejectedToday: boolean
  lastValue: number | null
  lastObservedDay: number | null
  baselineMedian: number | null
  percentChange: number | null
  /** Shifted far enough today to count toward a joint pattern. */
  member: boolean
  /** A core member of the pattern currently being reported. */
  inPattern: boolean
}

export interface LinkSnapshot {
  id: string
  a: string
  b: string
  status: RelationshipStatus
  rho: number
  lagDays: number
  leader: string
  follower: string
  /** 0–1 visual strength derived from |rho|. */
  strength: number
}

export interface PatternSnapshot {
  id: string
  stage: PatternStage
  active: boolean
  startDay: number
  detectedDay: number
  coreMemberIds: string[]
  durationDays: number
}

export interface VeilSnapshot {
  day: number
  totalDays: number
  nodes: Record<string, NodeSnapshot>
  pattern: PatternSnapshot | null
  links: LinkSnapshot[]
  joint: { t2: number; limit: number; ratio: number; exceeds: boolean } | null
  counts: Record<IndicatorStatus, number>
  /** Supported relationships that exist on this day, drawn or not. */
  supportedAvailable: number
  supportedFound: number
  events: MissionEventRecord[]
  actions: RecordedAction[]
  caption: string
}

export function buildSnapshot(analysis: MissionAnalysis, day: number, revealedLinks: readonly string[], actions: readonly RecordedAction[] = analysis.dataset.actions): VeilSnapshot {
  const d = Math.min(analysis.dataset.totalDays, Math.max(1, Math.round(day)))
  const cfg = analysis.config
  const joint = analysis.jointAt(d)
  const patterns = analysis.patternsAt(d)
  // Prefer the active pattern; otherwise the most recent one.
  const view = patterns.find((p) => p.active) ?? (patterns.length ? patterns[patterns.length - 1] : null)
  const core = new Set(view && view.active ? view.coreMemberIds : [])

  const nodes: Record<string, NodeSnapshot> = {}
  const counts: Record<IndicatorStatus, number> = { 'insufficient-data': 0, stale: 0, normal: 0, unusual: 0, drifting: 0, sustained: 0 }
  let members = 0
  for (const tl of analysis.timelines) {
    const s = tl.states[d - 1]
    counts[s.status]++
    const usable = s.status !== 'insufficient-data' && s.status !== 'stale'
    const member = usable && s.shift !== null && Math.abs(s.shift) >= cfg.limits.member
    if (member) members++
    nodes[tl.def.id] = {
      id: tl.def.id,
      status: s.status,
      shift: s.shift,
      intensity: usable && s.shift !== null ? Math.min(1, Math.abs(s.shift) / 5) : 0,
      direction: s.direction,
      observedToday: s.value !== null,
      rejectedToday: s.rejectedToday,
      lastValue: s.lastValue,
      lastObservedDay: s.lastObservedDay,
      baselineMedian: s.baseline && s.baseline.status !== 'insufficient' ? s.baseline.median : null,
      percentChange: s.percentChange,
      member,
      inPattern: core.has(tl.def.id),
    }
  }

  const relationships = analysis.relationshipsAt(d)
  const byId = new Map(relationships.map((r) => [r.id, r]))
  const links: LinkSnapshot[] = []
  for (const id of revealedLinks) {
    const r = byId.get(id)
    if (!r) continue
    links.push({ id: r.id, a: r.a, b: r.b, status: r.status, rho: r.rho, lagDays: r.lagDays, leader: r.leader, follower: r.follower, strength: Math.min(1, Math.abs(r.rho) / 0.8) })
  }
  const supported = relationships.filter((r) => r.status === 'supported')

  const eventsToday = analysis.dataset.events.filter((e) => d >= e.day && d <= (e.endDay ?? e.day))
  const actionsToday = actions.filter((a) => a.day === d)
  const referenceEnd = Math.max(...analysis.timelines.map((t) => t.referenceEnd))

  return {
    day: d,
    totalDays: analysis.dataset.totalDays,
    nodes,
    pattern: view
      ? { id: view.id, stage: view.stage, active: view.active, startDay: view.startDay, detectedDay: view.detectedDay, coreMemberIds: view.coreMemberIds, durationDays: view.durationDays }
      : null,
    links,
    joint: joint ? { t2: joint.t2, limit: joint.limit, ratio: joint.t2 / joint.limit, exceeds: joint.exceeds } : null,
    counts,
    supportedAvailable: supported.length,
    supportedFound: supported.filter((r) => revealedLinks.includes(r.id)).length,
    events: eventsToday,
    actions: actionsToday,
    caption: describeDay({
      day: d,
      referenceEnd: analysis.config.baseline.mode === 'reference' ? referenceEnd : 0,
      counts,
      members,
      jointRatio: joint ? joint.t2 / joint.limit : null,
      patternStage: view ? view.stage : null,
      patternDetectedToday: view ? view.detectedDay === d : false,
      patternSize: view ? view.coreMemberIds.length : 0,
      actionToday: actionsToday.length ? actionsToday[0].label : null,
    }),
  }
}
