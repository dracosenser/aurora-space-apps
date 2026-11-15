// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — multivariable pattern detection
//
// The joint statistic is a multivariate EWMA (MEWMA; Lowry, Woodall, Champ &
// Rigdon, 1992): the vector of smoothed robust deviations is measured against
// the correlation structure observed in the person's own baseline period.
// It responds to several small, simultaneous shifts that would not trip any
// single indicator's own control limit.
// ---------------------------------------------------------------------------

import type { IndicatorTimeline, JointState, PatternEpisode, PatternMemberView, PatternView, EvidenceStrength } from './types'
import type { EngineConfig } from './config'
import { chiSquareQuantile, chiSquareSurvival, invertMatrix, pearson, quadraticForm } from './robust'
import { isSparse } from './timeline'

export interface JointModel {
  /** Indicators eligible for the joint statistic (regularly sampled). */
  variableIds: string[]
  /** Shrunk baseline correlation matrix, in variableIds order. */
  correlation: number[][]
  /** First day on which the joint statistic is evaluated. */
  startDay: number
}

/** Estimate the baseline correlation of robust z between regularly sampled indicators. */
export function buildJointModel(timelines: IndicatorTimeline[], cfg: EngineConfig): JointModel {
  const eligible = timelines.filter((t) => !isSparse(t.def))
  const windowEnd = Math.max(cfg.baseline.mode === 'rolling' ? 60 : 0, ...eligible.map((t) => t.referenceEnd), cfg.baseline.referenceDays)
  const n = eligible.length
  const corr: number[][] = []
  for (let i = 0; i < n; i++) {
    corr.push(new Array<number>(n).fill(0))
    corr[i][i] = 1
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a: number[] = []
      const b: number[] = []
      for (let d = 1; d <= Math.min(windowEnd, eligible[i].states.length); d++) {
        const za = eligible[i].states[d - 1].z
        const zb = eligible[j].states[d - 1].z
        if (za !== null && zb !== null) {
          a.push(za)
          b.push(zb)
        }
      }
      const r = a.length >= 12 ? pearson(a, b) : 0
      const shrunk = (1 - cfg.joint.shrinkage) * r
      corr[i][j] = shrunk
      corr[j][i] = shrunk
    }
  }
  return { variableIds: eligible.map((t) => t.def.id), correlation: corr, startDay: windowEnd + 1 }
}

/** One joint state per mission day (null before the joint model is available). */
export function computeJointStates(timelines: IndicatorTimeline[], model: JointModel, cfg: EngineConfig): (JointState | null)[] {
  const totalDays = timelines.length ? timelines[0].states.length : 0
  const byId = new Map(timelines.map((t) => [t.def.id, t]))
  const inverseCache = new Map<string, number[][] | null>()
  const limitCache = new Map<number, number>()
  const out: (JointState | null)[] = []

  for (let day = 1; day <= totalDays; day++) {
    if (day < model.startDay) {
      out.push(null)
      continue
    }
    const idx: number[] = []
    const vec: number[] = []
    for (let k = 0; k < model.variableIds.length; k++) {
      const s = byId.get(model.variableIds[k])!.states[day - 1]
      if (s.shift === null || s.status === 'stale' || s.status === 'insufficient-data') continue
      idx.push(k)
      vec.push(s.shift)
    }
    if (idx.length < cfg.joint.minVariables) {
      out.push(null)
      continue
    }
    const key = idx.join(',')
    let inv = inverseCache.get(key)
    if (inv === undefined) {
      const sub = idx.map((i) => idx.map((j) => model.correlation[i][j]))
      inv = invertMatrix(sub)
      inverseCache.set(key, inv)
    }
    // Fall back to independence if the sub-matrix cannot be inverted.
    const t2 = inv ? quadraticForm(vec, inv) : vec.reduce((s, v) => s + v * v, 0)
    let limit = limitCache.get(idx.length)
    if (limit === undefined) {
      limit = chiSquareQuantile(1 - cfg.joint.alpha, idx.length)
      limitCache.set(idx.length, limit)
    }
    const members: string[] = []
    const categories = new Set<string>()
    for (let k = 0; k < idx.length; k++) {
      if (Math.abs(vec[k]) >= cfg.limits.member) {
        const id = model.variableIds[idx[k]]
        members.push(id)
        categories.add(byId.get(id)!.def.category)
      }
    }
    out.push({
      day,
      t2,
      limit,
      tailProbability: chiSquareSurvival(t2, idx.length),
      exceeds: t2 > limit,
      variables: idx.map((i) => model.variableIds[i]),
      members,
      categories: [...categories],
    })
  }
  return out
}

function isPatternDay(j: JointState | null, cfg: EngineConfig): boolean {
  return j !== null && j.exceeds && j.members.length >= cfg.pattern.minIndicators && j.categories.length >= cfg.pattern.minCategories
}

/** Group pattern days into episodes. An episode is reported once it has lasted the minimum number of days. */
export function findPatternEpisodes(joint: (JointState | null)[], cfg: EngineConfig): PatternEpisode[] {
  const episodes: PatternEpisode[] = []
  let days: number[] = []
  const flush = () => {
    if (days.length >= cfg.pattern.minDays) {
      let peakT2 = 0
      let peakDay = days[0]
      for (const d of days) {
        const j = joint[d - 1]!
        if (j.t2 > peakT2) {
          peakT2 = j.t2
          peakDay = d
        }
      }
      episodes.push({
        id: `CP-${String(days[0]).padStart(3, '0')}`,
        startDay: days[0],
        endDay: days[days.length - 1],
        detectedDay: days[cfg.pattern.minDays - 1],
        patternDays: days,
        peakT2,
        peakDay,
      })
    }
    days = []
  }
  for (let d = 1; d <= joint.length; d++) {
    if (isPatternDay(joint[d - 1], cfg)) {
      if (days.length && d - days[days.length - 1] > cfg.pattern.gapDays + 1) flush()
      days.push(d)
    }
  }
  flush()
  return episodes
}

/** The pattern as it would have been reported on a given mission day, or null if not yet detected. */
export function viewPattern(
  episode: PatternEpisode,
  day: number,
  timelines: IndicatorTimeline[],
  joint: (JointState | null)[],
  cfg: EngineConfig,
): PatternView | null {
  if (day < episode.detectedDay) return null
  const byId = new Map(timelines.map((t) => [t.def.id, t]))
  const daysSoFar = episode.patternDays.filter((d) => d <= day)
  const lastDay = daysSoFar[daysSoFar.length - 1]
  const active = day - lastDay <= cfg.pattern.gapDays
  const spanEnd = active ? day : lastDay
  const durationDays = spanEnd - episode.startDay + 1

  const memberCount = new Map<string, number>()
  for (const d of daysSoFar) for (const id of joint[d - 1]!.members) memberCount.set(id, (memberCount.get(id) ?? 0) + 1)

  const members: PatternMemberView[] = []
  let observed = 0
  let expected = 0
  for (const [id, count] of memberCount) {
    const tl = byId.get(id)!
    let ordinary = 0
    let readings = 0
    let ownSustainedDay: number | null = null
    for (let d = episode.startDay; d <= spanEnd; d++) {
      const s = tl.states[d - 1]
      if (s.z !== null) {
        readings++
        if (Math.abs(s.z) < 2) ordinary++
      }
    }
    // First day this indicator would have been called sustained on its own, near this episode.
    for (let d = Math.max(1, episode.startDay - 14); d <= spanEnd; d++) {
      if (tl.states[d - 1].status === 'sustained') {
        ownSustainedDay = d
        break
      }
    }
    const today = tl.states[day - 1]
    observed += readings
    expected += Math.max(1, Math.round((spanEnd - episode.startDay + 1) / tl.def.cadenceDays))
    members.push({
      indicatorId: id,
      memberDays: count,
      shareOfDays: count / daysSoFar.length,
      shiftToday: today.shift,
      direction: today.direction,
      percentChange: today.percentChange,
      ordinaryReadingShare: readings ? ordinary / readings : 0,
      ownSustainedDay,
    })
  }
  members.sort((a, b) => b.memberDays - a.memberDays)
  const core = members.filter((m) => m.shareOfDays >= cfg.pattern.coreFraction)
  const coreIds = core.map((m) => m.indicatorId)
  const categories = [...new Set(core.map((m) => byId.get(m.indicatorId)!.def.category))]

  const belowAtDetection = core.filter((m) => m.ownSustainedDay === null || m.ownSustainedDay > episode.detectedDay).length
  const sustainedDays = core.map((m) => m.ownSustainedDay).filter((d): d is number => d !== null)
  const firstOwn = sustainedDays.length ? Math.min(...sustainedDays) : null
  const leadDays = firstOwn === null ? null : firstOwn - episode.detectedDay

  const completeness = expected ? Math.min(1, observed / expected) : 0
  const todayJoint = joint[day - 1]
  let peakSoFar = 0
  for (const d of daysSoFar) peakSoFar = Math.max(peakSoFar, joint[d - 1]!.t2)
  const limit = todayJoint?.limit ?? joint[lastDay - 1]!.limit

  let strength: EvidenceStrength = 'limited'
  if (core.length >= cfg.pattern.minIndicators && durationDays >= 7 && completeness >= 0.6) strength = 'moderate'
  if (core.length >= cfg.pattern.minIndicators + 1 && durationDays >= cfg.pattern.sustainedDays && completeness >= 0.8 && peakSoFar >= 2 * limit) strength = 'strong'

  return {
    id: episode.id,
    stage: !active ? 'resolved' : durationDays >= cfg.pattern.sustainedDays ? 'sustained' : 'emerging',
    active,
    startDay: episode.startDay,
    detectedDay: episode.detectedDay,
    lastDay,
    durationDays,
    members,
    coreMemberIds: coreIds,
    categories,
    t2Today: todayJoint ? todayJoint.t2 : null,
    limit,
    peakT2: peakSoFar,
    tailProbability: todayJoint ? todayJoint.tailProbability : null,
    membersBelowOwnLimitAtDetection: belowAtDetection,
    leadDays,
    completeness,
    strength,
  }
}
