// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — relationship evaluation
//
// Two indicators are only described as related when their day-to-day
// fluctuations are associated more strongly than chance would produce, after:
//   1. removing each indicator's slow trend (so a shared drift cannot create
//      a spurious correlation),
//   2. reducing the sample size for autocorrelation (Pyper & Peterman, 1998),
//   3. correcting for the number of lags examined (Bonferroni), and
//   4. correcting for the number of indicator pairs examined (Benjamini–Hochberg).
// Overlap of deviation periods is reported descriptively and never counts as
// evidence on its own. Nothing here establishes causation.
// ---------------------------------------------------------------------------

import type { IndicatorTimeline, LagResult, RelationshipResult } from './types'
import type { EngineConfig } from './config'
import { autocorr, benjaminiHochberg, clamp, quantileSorted, sortedCopy, spearman, twoSidedP } from './robust'
import { isSparse } from './timeline'

/** Residual of each observation about a centred rolling median, using data up to `day` only. */
export function detrend(clean: readonly (number | null)[], day: number, windowDays: number): (number | null)[] {
  const half = Math.floor(windowDays / 2)
  const out: (number | null)[] = new Array(day).fill(null)
  const buf: number[] = []
  for (let t = 1; t <= day; t++) {
    const v = clean[t - 1]
    if (v === null) continue
    buf.length = 0
    const from = Math.max(1, t - half)
    const to = Math.min(day, t + half)
    for (let d = from; d <= to; d++) {
      const w = clean[d - 1]
      if (w !== null) buf.push(w)
    }
    if (buf.length < 5) continue
    out[t - 1] = v - quantileSorted(sortedCopy(buf), 0.5)
  }
  return out
}

interface PairedSample {
  x: number[]
  y: number[]
}

/** Pairs (a[t], b[t + lag]) where both residuals exist. */
function pairAtLag(a: readonly (number | null)[], b: readonly (number | null)[], lag: number): PairedSample {
  const x: number[] = []
  const y: number[] = []
  for (let t = 0; t < a.length; t++) {
    const u = t + lag
    if (u < 0 || u >= b.length) continue
    const va = a[t]
    const vb = b[u]
    if (va !== null && vb !== null) {
      x.push(va)
      y.push(vb)
    }
  }
  return { x, y }
}

/** Effective sample size for the correlation of two autocorrelated series. */
export function effectiveSampleSize(n: number, acfA: readonly number[], acfB: readonly number[]): number {
  let sum = 0
  const K = Math.min(acfA.length, acfB.length, Math.floor(n / 4))
  for (let k = 1; k <= K; k++) sum += ((n - k) / n) * acfA[k - 1] * acfB[k - 1]
  const nEff = n / (1 + 2 * sum)
  return clamp(nEff, 4, n)
}

function fisherP(rho: number, nEff: number): number {
  const r = clamp(rho, -0.999999, 0.999999)
  const z = Math.atanh(r) * Math.sqrt(Math.max(1, nEff - 3))
  return twoSidedP(z)
}

interface OverlapSummary {
  days: number
  start: number | null
  end: number | null
  onsetA: number | null
  onsetB: number | null
}

function longestRunStart(flags: boolean[]): number | null {
  let best = 0
  let bestStart: number | null = null
  let run = 0
  let start = 0
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      if (run === 0) start = i
      run++
      if (run > best) {
        best = run
        bestStart = start
      }
    } else {
      run = 0
    }
  }
  return best >= 3 && bestStart !== null ? bestStart + 1 : null
}

function overlapOf(a: IndicatorTimeline, b: IndicatorTimeline, day: number, memberLimit: number): OverlapSummary {
  const fa: boolean[] = []
  const fb: boolean[] = []
  let days = 0
  let start: number | null = null
  let end: number | null = null
  for (let d = 1; d <= day; d++) {
    const sa = a.states[d - 1]
    const sb = b.states[d - 1]
    const ma = sa.shift !== null && Math.abs(sa.shift) >= memberLimit && sa.status !== 'stale'
    const mb = sb.shift !== null && Math.abs(sb.shift) >= memberLimit && sb.status !== 'stale'
    fa.push(ma)
    fb.push(mb)
    if (ma && mb) {
      days++
      if (start === null) start = d
      end = d
    }
  }
  return { days, start, end, onsetA: longestRunStart(fa), onsetB: longestRunStart(fb) }
}

function fmt(v: number, d = 2): string {
  return v.toFixed(d).replace('-', '−')
}

function fmtQ(q: number): string {
  if (q < 0.0001) return '< 0.0001'
  return q.toFixed(q < 0.01 ? 4 : 3)
}

const STANDING_LIMITATIONS = [
  'An association in day-to-day fluctuations does not show that one measurement causes the other.',
  'A shared driver, such as workload or schedule, could produce the same association in both measurements.',
  'The estimate comes from one person over one period and may not hold at other times.',
]

/** Evaluate every pair of indicators using only observations up to `day`. */
export function evaluateRelationships(timelines: IndicatorTimeline[], day: number, cfg: EngineConfig): RelationshipResult[] {
  const rc = cfg.relationship
  const lagsToTest: number[] = []
  for (let l = -rc.maxLagDays; l <= rc.maxLagDays; l++) lagsToTest.push(l)

  const residuals = new Map<string, (number | null)[]>()
  const acfs = new Map<string, number[]>()
  for (const tl of timelines) {
    if (isSparse(tl.def)) continue
    const r = detrend(tl.clean, day, rc.detrendWindowDays)
    residuals.set(tl.def.id, r)
    const acf: number[] = []
    for (let k = 1; k <= rc.maxAcfLag; k++) acf.push(autocorr(r, k))
    acfs.set(tl.def.id, acf)
  }

  const results: RelationshipResult[] = []
  const testable: number[] = []

  for (let i = 0; i < timelines.length; i++) {
    for (let j = i + 1; j < timelines.length; j++) {
      const A = timelines[i]
      const B = timelines[j]
      const overlap = overlapOf(A, B, day, cfg.limits.member)
      const base: RelationshipResult = {
        id: `${A.def.id}~${B.def.id}`,
        a: A.def.id,
        b: B.def.id,
        day,
        status: 'insufficient-data',
        leader: A.def.id,
        follower: B.def.id,
        lagDays: 0,
        rho: 0,
        nPairs: 0,
        nEffective: 0,
        pLagCorrected: 1,
        qValue: 1,
        consistentAcrossHalves: false,
        lags: [],
        overlapDays: overlap.days,
        overlapStart: overlap.start,
        overlapEnd: overlap.end,
        onsetA: overlap.onsetA,
        onsetB: overlap.onsetB,
        reason: '',
        explanation: '',
        limitations: STANDING_LIMITATIONS,
      }

      const sparse = isSparse(A.def) ? A : isSparse(B.def) ? B : null
      if (sparse) {
        base.reason = `${sparse.def.label} is measured about every ${sparse.def.cadenceDays} days, which is too sparse to compare day-to-day fluctuations.`
        base.explanation = `A relationship between ${A.def.label.toLowerCase()} and ${B.def.label.toLowerCase()} cannot be evaluated. ${base.reason}`
        results.push(base)
        continue
      }

      const ra = residuals.get(A.def.id)!
      const rb = residuals.get(B.def.id)!
      const lagResults: LagResult[] = []
      let best: LagResult | null = null
      let bestSample: PairedSample | null = null
      for (const lag of lagsToTest) {
        const sample = pairAtLag(ra, rb, lag)
        const n = sample.x.length
        if (n < 8) continue
        const rho = spearman(sample.x, sample.y)
        const nEff = effectiveSampleSize(n, acfs.get(A.def.id)!, acfs.get(B.def.id)!)
        const p = fisherP(rho, nEff)
        const lr: LagResult = { lag, rho, n, nEffective: nEff, pValue: p }
        lagResults.push(lr)
        if (!best || p < best.pValue || (p === best.pValue && Math.abs(lag) < Math.abs(best.lag))) {
          best = lr
          bestSample = sample
        }
      }
      base.lags = lagResults

      if (!best || !bestSample || best.n < rc.minPairs) {
        const n = best ? best.n : 0
        base.nPairs = n
        base.reason = `Only ${n} paired days are available; at least ${rc.minPairs} are required before a relationship is evaluated.`
        base.explanation = `There is not yet enough overlapping data to evaluate ${A.def.label.toLowerCase()} against ${B.def.label.toLowerCase()}. ${base.reason}`
        results.push(base)
        continue
      }

      // Split-half consistency at the best lag.
      const half = Math.floor(best.n / 2)
      const r1 = spearman(bestSample.x.slice(0, half), bestSample.y.slice(0, half))
      const r2 = spearman(bestSample.x.slice(half), bestSample.y.slice(half))
      const sign = Math.sign(best.rho)
      base.consistentAcrossHalves = Math.sign(r1) === sign && Math.sign(r2) === sign && Math.min(Math.abs(r1), Math.abs(r2)) >= 0.1

      base.status = 'not-established'
      base.rho = best.rho
      base.nPairs = best.n
      base.nEffective = best.nEffective
      base.pLagCorrected = Math.min(1, best.pValue * lagsToTest.length)
      if (best.lag >= 0) {
        base.leader = A.def.id
        base.follower = B.def.id
        base.lagDays = best.lag
      } else {
        base.leader = B.def.id
        base.follower = A.def.id
        base.lagDays = -best.lag
      }
      testable.push(results.length)
      results.push(base)
    }
  }

  // Multiplicity correction across all pairs that could be tested today.
  const q = benjaminiHochberg(testable.map((idx) => results[idx].pLagCorrected))
  const byId = new Map(timelines.map((t) => [t.def.id, t.def]))
  testable.forEach((idx, k) => {
    const r = results[idx]
    r.qValue = q[k]
    const leader = byId.get(r.leader)!
    const follower = byId.get(r.follower)!
    const strongEnough = Math.abs(r.rho) >= rc.minAbsRho
    const enoughN = r.nEffective >= rc.minEffectiveN
    const significant = r.qValue <= rc.alpha
    const stats = `Spearman ρ = ${fmt(r.rho)} over ${r.nPairs} paired days (effective sample size ${Math.round(r.nEffective)} after allowing for autocorrelation); q = ${fmtQ(r.qValue)} after correcting for ${lagsToTest.length} lags and ${testable.length} indicator pairs.`
    const overlapNote =
      r.overlapDays > 0 && r.overlapStart !== null && r.overlapEnd !== null
        ? ` Both were also shifted from their baselines on ${r.overlapDays} overlapping day${r.overlapDays === 1 ? '' : 's'} (mission days ${r.overlapStart}–${r.overlapEnd}); that overlap is descriptive and is not counted as evidence.`
        : ''

    if (significant && strongEnough && enoughN && r.consistentAcrossHalves) {
      r.status = 'supported'
      const timing = r.lagDays === 0 ? 'on the same day' : `with ${leader.label.toLowerCase()} leading by ${r.lagDays} day${r.lagDays === 1 ? '' : 's'}`
      const sense = r.rho < 0 ? 'in opposite directions' : 'in the same direction'
      r.explanation = `Day-to-day fluctuations in ${leader.label.toLowerCase()} and ${follower.label.toLowerCase()} moved ${sense}, ${timing}. ${stats} The association has the same sign in both halves of the record.${overlapNote}`
      r.reason = ''
    } else {
      const why: string[] = []
      if (!significant) why.push('the association is not distinguishable from chance after multiplicity correction')
      if (significant && !strongEnough) why.push(`the association is too weak to report (|ρ| below ${rc.minAbsRho})`)
      if (!enoughN) why.push(`the effective sample size (${Math.round(r.nEffective)}) is below the required ${rc.minEffectiveN}`)
      if (significant && strongEnough && !r.consistentAcrossHalves) why.push('the association is not stable across the two halves of the record')
      r.reason = why.join('; ') + '.'
      r.reason = r.reason.charAt(0).toUpperCase() + r.reason.slice(1)
      const lead =
        r.overlapDays >= 7
          ? `${leader.label} and ${follower.label.toLowerCase()} were both shifted from baseline during an overlapping period, but a relationship between them cannot be established.`
          : `A relationship between ${leader.label.toLowerCase()} and ${follower.label.toLowerCase()} cannot be established from the available data.`
      r.explanation = `${lead} ${r.reason} ${stats}${overlapNote}${r.overlapDays >= 7 ? ' Changing at the same time is not, by itself, evidence that two measurements are related.' : ''}`
    }
  })

  return results
}

export function findRelationship(results: RelationshipResult[], x: string, y: string): RelationshipResult | undefined {
  return results.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x))
}

export interface SupportingPair {
  /** Mission day of the leading indicator's observation. */
  day: number
  /** Leader's deviation from its recent level that day. */
  x: number
  /** Follower's deviation from its recent level `lagDays` later. */
  y: number
}

/** The paired, detrended observations behind a relationship result, for display alongside it. */
export function supportingPairs(timelines: IndicatorTimeline[], r: RelationshipResult, cfg: EngineConfig): SupportingPair[] {
  const leader = timelines.find((t) => t.def.id === r.leader)
  const follower = timelines.find((t) => t.def.id === r.follower)
  if (!leader || !follower || isSparse(leader.def) || isSparse(follower.def)) return []
  const ra = detrend(leader.clean, r.day, cfg.relationship.detrendWindowDays)
  const rb = detrend(follower.clean, r.day, cfg.relationship.detrendWindowDays)
  const out: SupportingPair[] = []
  for (let t = 0; t < ra.length; t++) {
    const u = t + r.lagDays
    if (u >= rb.length) break
    const x = ra[t]
    const y = rb[u]
    if (x !== null && y !== null) out.push({ day: t + 1, x, y })
  }
  return out
}
