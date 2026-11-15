// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — countermeasure response tracking
//
// Compares measurements before and after an action the crew member recorded
// under an approved mission health protocol. The engine never recommends an
// action and never attributes a change to one: a before/after comparison in a
// single person has no control condition.
// ---------------------------------------------------------------------------

import type { IndicatorTimeline, MissionEventRecord, RecordedAction, ResponseClassification, ResponseEvaluation, ResponseIndicatorResult } from './types'
import type { EngineConfig } from './config'
import { hodgesLehmann, mannWhitney, median, theilSen } from './robust'
import { isSparse } from './timeline'

function windowValues(clean: readonly (number | null)[], from: number, to: number): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  for (let d = Math.max(1, from); d <= Math.min(clean.length, to); d++) {
    const v = clean[d - 1]
    if (v !== null) {
      xs.push(d)
      ys.push(v)
    }
  }
  return { xs, ys }
}

export function evaluateResponse(
  action: RecordedAction,
  day: number,
  timelines: IndicatorTimeline[],
  events: readonly MissionEventRecord[],
  otherActions: readonly RecordedAction[],
  cfg: EngineConfig,
): ResponseEvaluation {
  const rc = cfg.response
  const totalDays = timelines.length ? timelines[0].states.length : 0
  const preWindow: [number, number] = [Math.max(1, action.day - rc.preDays), action.day - 1]
  const plannedPostEnd = Math.min(totalDays, action.day + rc.postDays)
  const postEnd = Math.min(day, plannedPostEnd)
  const postWindow: [number, number] = [action.day + 1, Math.max(action.day, postEnd)]
  const postDaysElapsed = Math.max(0, postEnd - action.day)
  const postDaysPlanned = plannedPostEnd - action.day

  const status = postDaysElapsed < rc.minObservations ? 'awaiting-data' : postDaysElapsed < postDaysPlanned ? 'limited-data' : 'evaluated'
  const labelOf = new Map(timelines.map((t) => [t.def.id, t.def.label]))

  const indicators: ResponseIndicatorResult[] = []
  for (const tl of timelines) {
    const sparse = isSparse(tl.def)
    const minObs = sparse ? Math.max(3, rc.minSparseObservations) : rc.minObservations
    const pre = windowValues(tl.clean, preWindow[0], preWindow[1])
    const post = postDaysElapsed > 0 ? windowValues(tl.clean, postWindow[0], postWindow[1]) : { xs: [], ys: [] }
    const baseState = tl.states[Math.max(0, Math.min(totalDays, action.day) - 1)]
    const baseline = baseState.baseline && baseState.baseline.status !== 'insufficient' ? baseState.baseline : null
    const isTarget = action.targetIndicators.includes(tl.def.id)
    const result: ResponseIndicatorResult = {
      indicatorId: tl.def.id,
      isTarget,
      nPre: pre.ys.length,
      nPost: post.ys.length,
      expectedPre: Math.max(1, Math.round((preWindow[1] - preWindow[0] + 1) / tl.def.cadenceDays)),
      expectedPost: Math.max(1, Math.round(Math.max(1, postDaysElapsed) / tl.def.cadenceDays)),
      medianPre: pre.ys.length ? median(pre.ys) : null,
      medianPost: post.ys.length ? median(post.ys) : null,
      baselineMedian: baseline ? baseline.median : null,
      zPre: null,
      zPost: null,
      distanceChange: null,
      shiftEstimate: null,
      pValue: null,
      slopePrePerWeek: null,
      slopePostPerWeek: null,
      preTrendTowardBaseline: false,
      classification: 'insufficient-data',
    }
    if (!baseline || pre.ys.length < minObs || post.ys.length < minObs || status === 'awaiting-data') {
      indicators.push(result)
      continue
    }
    const zPre = (result.medianPre! - baseline.median) / baseline.scale
    const zPost = (result.medianPost! - baseline.median) / baseline.scale
    const mw = mannWhitney(pre.ys, post.ys)
    result.zPre = zPre
    result.zPost = zPost
    result.distanceChange = Math.abs(zPre) - Math.abs(zPost)
    result.shiftEstimate = hodgesLehmann(pre.ys, post.ys)
    result.pValue = mw.pValue
    if (pre.ys.length >= 5) result.slopePrePerWeek = theilSen(pre.xs, pre.ys).slope * 7
    if (post.ys.length >= 5) result.slopePostPerWeek = theilSen(post.xs, post.ys).slope * 7
    if (result.slopePrePerWeek !== null && Math.abs(zPre) >= rc.nearBaselineZ) {
      const preChangeSd = (result.slopePrePerWeek * (rc.preDays / 7)) / baseline.scale
      result.preTrendTowardBaseline = Math.sign(preChangeSd) === -Math.sign(zPre) && Math.abs(preChangeSd) >= rc.minDistanceChange
    }
    let cls: ResponseClassification = 'no-clear-change'
    if (Math.abs(zPre) < rc.nearBaselineZ && Math.abs(zPost) < rc.nearBaselineZ) cls = 'near-baseline-before'
    else if (result.distanceChange >= rc.minDistanceChange && mw.pValue < rc.alpha) cls = 'moved-toward-baseline'
    else if (result.distanceChange <= -rc.minDistanceChange && mw.pValue < rc.alpha) cls = 'moved-away-from-baseline'
    result.classification = cls
    indicators.push(result)
  }

  // --- Context that could explain a change independently of the recorded action.
  const confounders: ResponseEvaluation['confounders'] = []
  for (const e of events) {
    const eEnd = e.endDay ?? e.day
    if (eEnd >= preWindow[0] && e.day <= plannedPostEnd && e.day <= day) {
      confounders.push({ kind: 'event', day: e.day, label: e.title, detail: `Logged mission event on day ${e.day}${e.endDay ? `–${e.endDay}` : ''}, inside the comparison windows. ${e.description}` })
    }
  }
  for (const o of otherActions) {
    if (o.id === action.id) continue
    if (o.day >= preWindow[0] && o.day <= plannedPostEnd && o.day <= day) {
      confounders.push({ kind: 'action', day: o.day, label: o.label, detail: `Another recorded action on day ${o.day} falls inside the comparison windows, so the two cannot be separated.` })
    }
  }
  for (const r of indicators) {
    if (r.preTrendTowardBaseline && r.isTarget) {
      confounders.push({ kind: 'pre-trend', day: action.day, label: `${labelOf.get(r.indicatorId)} was already moving toward baseline`, detail: 'The trend toward baseline had begun before the recorded action, so the action cannot be distinguished from a recovery already under way.' })
    }
    if (r.isTarget && status !== 'awaiting-data' && (r.nPre / r.expectedPre < 0.6 || r.nPost / r.expectedPost < 0.6)) {
      confounders.push({ kind: 'data-gap', day: action.day, label: `Incomplete data for ${labelOf.get(r.indicatorId)}`, detail: `${r.nPre} of ${r.expectedPre} expected observations before and ${r.nPost} of ${r.expectedPost} after.` })
    }
  }
  confounders.sort((a, b) => a.day - b.day)

  const targets = indicators.filter((r) => r.isTarget)
  const targetsEvaluated = targets.filter((r) => r.classification !== 'insufficient-data').length
  const toward = targets.filter((r) => r.classification === 'moved-toward-baseline')
  const away = targets.filter((r) => r.classification === 'moved-away-from-baseline')
  const othersChanged = indicators
    .filter((r) => !r.isTarget && (r.classification === 'moved-toward-baseline' || r.classification === 'moved-away-from-baseline'))
    .map((r) => r.indicatorId)

  const names = (ids: string[]) => ids.map((id) => (labelOf.get(id) ?? id).toLowerCase())
  const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

  let summary: string
  if (day < action.day) {
    summary = `This action is recorded on mission day ${action.day}, which is after the selected day.`
  } else if (status === 'awaiting-data') {
    summary = `Recorded on mission day ${action.day}. ${postDaysElapsed} of ${postDaysPlanned} follow-up days have been observed; at least ${rc.minObservations} are needed before any comparison is made.`
  } else {
    const parts: string[] = []
    if (targetsEvaluated === 0) {
      parts.push('None of the indicators designated by the protocol has enough observations on both sides of the recorded action to be compared.')
    } else {
      if (toward.length > 0) {
        parts.push(`${toward.length} of ${targetsEvaluated} protocol-designated indicators moved closer to this crew member's previous baseline in the ${postDaysElapsed} days after the recorded action (${list(names(toward.map((r) => r.indicatorId)))}).`)
      } else {
        parts.push(`None of the ${targetsEvaluated} protocol-designated indicators showed a clear movement toward the previous baseline in the ${postDaysElapsed} days after the recorded action.`)
      }
      if (away.length > 0) parts.push(`${list(names(away.map((r) => r.indicatorId)))} moved further from baseline.`)
    }
    if (othersChanged.length > 0) parts.push(`Other indicators changed over the same period: ${list(names(othersChanged))}.`)
    const eventCount = confounders.filter((c) => c.kind === 'event' || c.kind === 'action').length
    if (eventCount > 0) parts.push(`${eventCount} logged event${eventCount === 1 ? '' : 's'} or action${eventCount === 1 ? '' : 's'} fall inside the comparison windows and could account for some of the change.`)
    if (status === 'limited-data') parts.push(`The follow-up window is still open (${postDaysElapsed} of ${postDaysPlanned} days).`)
    parts.push('These observations describe what happened after the action. They cannot determine whether the action caused the change.')
    summary = parts.join(' ')
  }

  return {
    actionId: action.id,
    action,
    asOfDay: day,
    status,
    preWindow,
    postWindow,
    postDaysElapsed,
    postDaysPlanned,
    indicators,
    targetsTowardBaseline: toward.length,
    targetsEvaluated,
    othersChanged,
    confounders,
    summary,
    limitations: [
      'A before/after comparison in one person has no control condition, so it cannot establish cause.',
      'Measurements that were unusually far from baseline tend to move back toward it regardless of any action (regression toward the mean).',
      'Mission events and other actions inside the comparison windows are listed as context; their effects cannot be separated from the recorded action.',
      `Windows are ${rc.preDays} days before and up to ${rc.postDays} days after; a different window could give a different picture.`,
      'The engine reports recorded actions only. It does not recommend or prescribe countermeasures.',
    ],
  }
}
