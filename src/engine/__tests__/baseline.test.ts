import { describe, expect, it } from 'vitest'
import { createMissionAnalysis } from '../analysis'
import { DEFAULT_CONFIG } from '../config'
import { computeIndicatorTimeline, referenceEndFor } from '../timeline'
import { ewmaSigma } from '../robust'
import { dataset, indicator, noise } from './helpers'

describe('personal baseline engine', () => {
  it('builds the baseline from the reference window using median and scaled MAD', () => {
    const x = noise(120, 21, 60, 2)
    const tl = computeIndicatorTimeline(indicator('hr'), x, 120, DEFAULT_CONFIG)
    const b = tl.states[99].baseline!
    expect(b.status).toBe('established')
    expect(b.windowStart).toBe(1)
    expect(b.windowEnd).toBe(DEFAULT_CONFIG.baseline.referenceDays)
    expect(b.n).toBe(40)
    expect(b.median).toBeGreaterThan(59)
    expect(b.median).toBeLessThan(61)
    expect(b.scale).toBeGreaterThan(1.2)
    expect(b.scale).toBeLessThan(3)
  })

  it('never lets later observations change an established reference baseline', () => {
    const x = noise(120, 22, 60, 2)
    const y = [...x]
    for (let i = 60; i < 120; i++) y[i] += 25
    const a = computeIndicatorTimeline(indicator('hr'), x, 120, DEFAULT_CONFIG).states[119].baseline!
    const b = computeIndicatorTimeline(indicator('hr'), y, 120, DEFAULT_CONFIG).states[119].baseline!
    expect(b.median).toBe(a.median)
    expect(b.scale).toBe(a.scale)
  })

  it('does not use today\'s value in today\'s baseline', () => {
    const x = noise(30, 23, 10, 1)
    const y = [...x]
    y[24] = 1000
    const a = computeIndicatorTimeline(indicator('v'), x, 30, DEFAULT_CONFIG).states[24].baseline!
    const b = computeIndicatorTimeline(indicator('v'), y, 30, DEFAULT_CONFIG).states[24].baseline!
    expect(b.median).toBe(a.median)
  })

  it('reports insufficient data instead of a conclusion when there are too few observations', () => {
    const x = noise(60, 24, 10, 1)
    const tl = computeIndicatorTimeline(indicator('v'), x, 60, DEFAULT_CONFIG)
    expect(tl.states[4].status).toBe('insufficient-data')
    expect(tl.states[4].z).toBeNull()
    expect(tl.states[4].shift).toBeNull()
    // Provisional once the minimum is met, established after the reference window.
    expect(tl.states[20].baseline!.status).toBe('provisional')
    expect(tl.states[50].baseline!.status).toBe('established')
  })

  it('handles missing observations without inventing values', () => {
    const x: (number | null)[] = noise(100, 25, 10, 1)
    for (const d of [5, 6, 7, 30, 31, 70]) x[d - 1] = null
    const tl = computeIndicatorTimeline(indicator('v'), x, 100, DEFAULT_CONFIG)
    expect(tl.states[69].value).toBeNull()
    expect(tl.states[69].z).toBeNull()
    expect(tl.states[69].lastObservedDay).toBe(69)
    expect(tl.states[99].baseline!.n).toBe(35)
    expect(tl.states[99].baseline!.completeness).toBeCloseTo(35 / 40, 6)
  })

  it('marks an indicator stale after a run of missing days and recovers when data returns', () => {
    const x: (number | null)[] = noise(100, 26, 10, 1)
    for (let d = 60; d <= 70; d++) x[d - 1] = null
    const tl = computeIndicatorTimeline(indicator('v'), x, 100, DEFAULT_CONFIG)
    expect(tl.states[61].status).not.toBe('stale') // three days: still within tolerance
    expect(tl.states[66].status).toBe('stale')
    expect(tl.states[71].status).not.toBe('stale')
  })

  it('screens out physically implausible readings', () => {
    const x: (number | null)[] = noise(80, 27, 60, 2)
    x[49] = 0
    x[50] = Number.NaN
    const tl = computeIndicatorTimeline(indicator('hr', 'cat-a', { plausibleRange: [30, 130] }), x, 80, DEFAULT_CONFIG)
    expect(tl.rejectedDays).toEqual([50, 51])
    expect(tl.states[49].value).toBeNull()
    expect(tl.states[49].rejectedToday).toBe(true)
    expect(tl.states[49].status).not.toBe('sustained')
  })

  it('keeps a robust baseline when the reference window itself contains an outlier', () => {
    const x = noise(100, 28, 60, 2)
    const y = [...x]
    y[19] = 95
    const a = computeIndicatorTimeline(indicator('hr'), x, 100, DEFAULT_CONFIG).states[99].baseline!
    const b = computeIndicatorTimeline(indicator('hr'), y, 100, DEFAULT_CONFIG).states[99].baseline!
    expect(Math.abs(b.median - a.median)).toBeLessThan(0.6)
    expect(Math.abs(b.scale - a.scale) / a.scale).toBeLessThan(0.25)
    expect(Math.abs(b.sd - a.sd) / a.sd).toBeGreaterThan(0.5) // the ordinary SD is badly distorted
  })

  it('extends the reference window for sparsely sampled indicators', () => {
    const weekly = indicator('strength', 'cat-a', { cadenceDays: 7 })
    expect(referenceEndFor(weekly, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(40)
    const x: (number | null)[] = new Array(120).fill(null)
    const vals = noise(20, 29, 100, 0.5)
    for (let k = 0; k < 17; k++) x[k * 7 + 2] = vals[k]
    const tl = computeIndicatorTimeline(weekly, x, 120, DEFAULT_CONFIG)
    expect(tl.states[20].status).toBe('insufficient-data')
    expect(tl.states[100].baseline!.status).toBe('established')
    expect(tl.states[100].baseline!.n).toBeGreaterThanOrEqual(5)
  })

  it('widens limits when the baseline rests on few observations', () => {
    const many = computeIndicatorTimeline(indicator('v'), noise(100, 30, 10, 1), 100, DEFAULT_CONFIG).states[99].baseline!
    const fewSeries: (number | null)[] = noise(100, 30, 10, 1)
    for (let d = 1; d <= 40; d++) if (d % 2 === 0) fewSeries[d - 1] = null
    const few = computeIndicatorTimeline(indicator('v'), fewSeries, 100, DEFAULT_CONFIG).states[99].baseline!
    expect(few.n).toBe(20)
    // The extra variance from estimating the baseline centre is (π/2)/n, so it doubles when n halves.
    const extra = (b: typeof few) => b.sigmaE ** 2 - ewmaSigma(DEFAULT_CONFIG.ewmaLambda, b.phi) ** 2
    expect(extra(many)).toBeCloseTo(Math.PI / 2 / 40, 10)
    expect(extra(few)).toBeCloseTo(Math.PI / 2 / 20, 10)
  })

  it('follows slow expected drift in rolling mode', () => {
    const x = noise(300, 31, 100, 1, (d) => -0.05 * d)
    const reference = createMissionAnalysis(dataset([indicator('bone')], { bone: x }))
    const rolling = createMissionAnalysis(dataset([indicator('bone')], { bone: x }), { baseline: { mode: 'rolling' } })
    // Readings are winsorised before smoothing, so the fixed-baseline shift saturates rather than growing without bound.
    expect(Math.abs(reference.stateAt('bone', 290).shift!)).toBeGreaterThan(5)
    expect(reference.stateAt('bone', 290).status).toBe('sustained')
    expect(Math.abs(rolling.stateAt('bone', 290).z!)).toBeLessThan(6)
    expect(rolling.stateAt('bone', 290).baseline!.windowEnd).toBeLessThan(290)
  })
})
