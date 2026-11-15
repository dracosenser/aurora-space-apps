import { describe, expect, it } from 'vitest'
import {
  MAD_SCALE,
  benjaminiHochberg,
  chiSquareQuantile,
  chiSquareSurvival,
  ewmaSigma,
  hodgesLehmann,
  invertMatrix,
  mad,
  mannKendall,
  mannWhitney,
  median,
  normalCdf,
  normalQuantile,
  quadraticForm,
  ranks,
  spearman,
  theilSen,
} from '../robust'
import { noise } from './helpers'

describe('robust statistics', () => {
  it('computes median and MAD', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(mad([1, 2, 3, 4, 100])).toBe(1)
  })

  it('MAD-based scale resists an outlier that wrecks the standard deviation', () => {
    const clean = noise(60, 11, 50, 2)
    const dirty = [...clean]
    dirty[10] = 500
    const scaleClean = MAD_SCALE * mad(clean)
    const scaleDirty = MAD_SCALE * mad(dirty)
    expect(Math.abs(scaleDirty - scaleClean) / scaleClean).toBeLessThan(0.15)
    expect(Math.abs(median(dirty) - median(clean))).toBeLessThan(0.5)
  })

  it('recovers the scale of normal data', () => {
    const x = noise(4000, 7, 0, 3)
    expect(MAD_SCALE * mad(x)).toBeGreaterThan(2.8)
    expect(MAD_SCALE * mad(x)).toBeLessThan(3.2)
  })

  it('gives the textbook EWMA standard deviation for white noise and widens it for autocorrelation', () => {
    expect(ewmaSigma(0.25, 0)).toBeCloseTo(Math.sqrt(0.25 / 1.75), 10)
    expect(ewmaSigma(0.25, 0.4)).toBeGreaterThan(ewmaSigma(0.25, 0))
  })

  it('normal CDF and quantile are inverses', () => {
    for (const p of [0.001, 0.025, 0.2, 0.5, 0.8, 0.975, 0.999]) expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 6)
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4)
  })

  it('approximates chi-square quantiles and tails', () => {
    expect(chiSquareQuantile(0.999, 9)).toBeGreaterThan(27.4)
    expect(chiSquareQuantile(0.999, 9)).toBeLessThan(28.4) // exact value 27.877
    expect(chiSquareQuantile(0.95, 3)).toBeGreaterThan(7.6)
    expect(chiSquareQuantile(0.95, 3)).toBeLessThan(8.0) // exact value 7.815
    expect(chiSquareSurvival(27.877, 9)).toBeGreaterThan(0.0007)
    expect(chiSquareSurvival(27.877, 9)).toBeLessThan(0.0014)
  })

  it('ranks with ties and computes Spearman correlation', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4])
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 8, 16, 32])).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 10)
  })

  it('Theil–Sen recovers a slope despite outliers', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i)
    const ys = xs.map((x) => 2 + 0.5 * x)
    ys[5] = 90
    ys[20] = -40
    expect(theilSen(xs, ys).slope).toBeCloseTo(0.5, 2)
  })

  it('Mann–Kendall detects a monotonic trend and not pure noise', () => {
    const trend = noise(30, 3, 0, 1, (d) => 0.25 * d)
    expect(mannKendall(trend).pValue).toBeLessThan(0.001)
    expect(mannKendall(noise(30, 4)).pValue).toBeGreaterThan(0.05)
  })

  it('Mann–Whitney separates shifted samples and Hodges–Lehmann estimates the shift', () => {
    const a = noise(25, 5, 10, 1)
    const b = noise(25, 6, 12, 1)
    expect(mannWhitney(a, b).pValue).toBeLessThan(0.001)
    expect(hodgesLehmann(a, b)).toBeGreaterThan(1.4)
    expect(hodgesLehmann(a, b)).toBeLessThan(2.6)
    expect(mannWhitney(noise(25, 8, 10, 1), noise(25, 9, 10, 1)).pValue).toBeGreaterThan(0.05)
  })

  it('applies the Benjamini–Hochberg adjustment', () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.005])
    expect(q[3]).toBeCloseTo(0.02, 10)
    expect(q[0]).toBeCloseTo(0.02, 10)
    expect(q[2]).toBeCloseTo(0.04, 10)
    expect(q[1]).toBeCloseTo(0.04, 10)
  })

  it('inverts a matrix and evaluates a quadratic form', () => {
    const m = [
      [2, 0.5],
      [0.5, 1],
    ]
    const inv = invertMatrix(m)!
    expect(inv[0][0] * 2 + inv[0][1] * 0.5).toBeCloseTo(1, 10)
    expect(quadraticForm([1, 2], [[1, 0], [0, 1]])).toBe(5)
    expect(invertMatrix([[1, 2], [2, 4]])).toBeNull()
  })
})
