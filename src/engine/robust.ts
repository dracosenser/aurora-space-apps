// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — robust and nonparametric statistics
//
// Everything here is deterministic, allocation-light and free of side effects.
// Method references are given so each routine can be checked independently.
// ---------------------------------------------------------------------------

/** Consistency constant that makes MAD comparable to a standard deviation under normality. */
export const MAD_SCALE = 1.4826

export function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

/** Linear-interpolated quantile of an already sorted array. */
export function quantileSorted(sorted: readonly number[], q: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0]
  const pos = (n - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function median(values: readonly number[]): number {
  return quantileSorted(sortedCopy(values), 0.5)
}

/** Raw median absolute deviation about the median. */
export function mad(values: readonly number[], center?: number): number {
  if (values.length === 0) return NaN
  const c = center ?? median(values)
  const dev = values.map((v) => Math.abs(v - c))
  return median(dev)
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN
  let s = 0
  for (let i = 0; i < values.length; i++) s += values[i]
  return s / values.length
}

export function sd(values: readonly number[]): number {
  const n = values.length
  if (n < 2) return 0
  const m = mean(values)
  let s = 0
  for (let i = 0; i < n; i++) s += (values[i] - m) * (values[i] - m)
  return Math.sqrt(s / (n - 1))
}

/** Lag-k autocorrelation of a series that may contain gaps (null). */
export function autocorr(values: readonly (number | null)[], k: number): number {
  let sum = 0
  let n = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v !== null) {
      sum += v
      n++
    }
  }
  if (n < 3) return 0
  const m = sum / n
  let num = 0
  let den = 0
  let pairs = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null) continue
    den += (v - m) * (v - m)
    const w = i + k < values.length ? values[i + k] : null
    if (w !== null) {
      num += (v - m) * (w - m)
      pairs++
    }
  }
  if (den <= 0 || pairs < 3) return 0
  // Scale the numerator to the full-length denominator.
  return (num / pairs) / (den / n)
}

/**
 * Standard deviation of an EWMA of a unit-variance AR(1) series.
 * For white noise this reduces to sqrt(lambda / (2 - lambda)); positive
 * autocorrelation widens it. (Standard EWMA control-chart result.)
 */
export function ewmaSigma(lambda: number, phi: number): number {
  const p = Math.min(0.8, Math.max(0, phi))
  const base = lambda / (2 - lambda)
  const inflate = (1 + p * (1 - lambda)) / (1 - p * (1 - lambda))
  return Math.sqrt(base * inflate)
}

// ------------------------------------------------------------ distributions

/** Complementary error function, fractional error < 1.2e-7 (Numerical Recipes erfcc). */
export function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const coeffs = [0.17087277, -0.82215223, 1.48851587, -1.13520398, 0.27886807, -0.18628806, 0.09678418, 0.37409196, 1.00002368, -1.26551223]
  let poly = 0
  for (let i = 0; i < coeffs.length; i++) poly = poly * t + coeffs[i]
  const r = t * Math.exp(-z * z + poly)
  return x >= 0 ? r : 2 - r
}

/** Upper tail of the standard normal. */
export function normalSurvival(x: number): number {
  return 0.5 * erfc(x / Math.SQRT2)
}

export function normalCdf(x: number): number {
  return 1 - normalSurvival(x)
}

/** Two-sided p-value for a standard normal statistic. */
export function twoSidedP(z: number): number {
  return Math.min(1, 2 * normalSurvival(Math.abs(z)))
}

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Chi-square quantile by the Wilson–Hilferty cube-root approximation. */
export function chiSquareQuantile(p: number, df: number): number {
  const z = normalQuantile(p)
  const k = 2 / (9 * df)
  const v = 1 - k + z * Math.sqrt(k)
  return df * v * v * v
}

/** Chi-square upper tail by the Wilson–Hilferty approximation. */
export function chiSquareSurvival(x: number, df: number): number {
  if (x <= 0) return 1
  const k = 2 / (9 * df)
  const z = (Math.cbrt(x / df) - (1 - k)) / Math.sqrt(k)
  return normalSurvival(z)
}

// ------------------------------------------------------------- rank methods

/** Average ranks (1-based) with ties sharing the mean rank. */
export function ranks(values: readonly number[]): number[] {
  const n = values.length
  const idx = new Array<number>(n)
  for (let i = 0; i < n; i++) idx[i] = i
  idx.sort((i, j) => values[i] - values[j])
  const out = new Array<number>(n)
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && values[idx[j + 1]] === values[idx[i]]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[idx[k]] = r
    i = j + 1
  }
  return out
}

export function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    sab += da * db
    saa += da * da
    sbb += db * db
  }
  if (saa <= 0 || sbb <= 0) return 0
  return sab / Math.sqrt(saa * sbb)
}

/** Spearman rank correlation. */
export function spearman(a: readonly number[], b: readonly number[]): number {
  return pearson(ranks(a), ranks(b))
}

/** Theil–Sen estimator: the median of all pairwise slopes. Robust to outliers. */
export function theilSen(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return { slope: 0, intercept: n === 1 ? ys[0] : NaN }
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j] - xs[i]
      if (dx !== 0) slopes.push((ys[j] - ys[i]) / dx)
    }
  }
  const slope = slopes.length ? median(slopes) : 0
  const resid: number[] = []
  for (let i = 0; i < n; i++) resid.push(ys[i] - slope * xs[i])
  return { slope, intercept: median(resid) }
}

/** Mann–Kendall trend test (normal approximation with tie correction). `ys` must be in time order. */
export function mannKendall(ys: readonly number[]): { s: number; z: number; pValue: number } {
  const n = ys.length
  if (n < 4) return { s: 0, z: 0, pValue: 1 }
  let s = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = ys[j] - ys[i]
      if (d > 0) s++
      else if (d < 0) s--
    }
  }
  // Tie correction.
  const sorted = sortedCopy(ys)
  let tieTerm = 0
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && sorted[j + 1] === sorted[i]) j++
    const t = j - i + 1
    if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5)
    i = j + 1
  }
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18
  if (variance <= 0) return { s, z: 0, pValue: 1 }
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0
  return { s, z, pValue: twoSidedP(z) }
}

/** Mann–Whitney U test, two-sided, normal approximation with tie and continuity corrections. */
export function mannWhitney(a: readonly number[], b: readonly number[]): { u: number; z: number; pValue: number } {
  const n1 = a.length
  const n2 = b.length
  if (n1 < 3 || n2 < 3) return { u: NaN, z: 0, pValue: 1 }
  const all = [...a, ...b]
  const r = ranks(all)
  let r1 = 0
  for (let i = 0; i < n1; i++) r1 += r[i]
  const u1 = r1 - (n1 * (n1 + 1)) / 2
  const mu = (n1 * n2) / 2
  const n = n1 + n2
  const sorted = sortedCopy(all)
  let tieTerm = 0
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && sorted[j + 1] === sorted[i]) j++
    const t = j - i + 1
    if (t > 1) tieTerm += t * t * t - t
    i = j + 1
  }
  const variance = ((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1)))
  if (variance <= 0) return { u: u1, z: 0, pValue: 1 }
  const diff = u1 - mu
  const z = (diff - Math.sign(diff) * 0.5) / Math.sqrt(variance)
  return { u: u1, z, pValue: twoSidedP(z) }
}

/** Hodges–Lehmann shift estimate: median of all (b − a) differences. */
export function hodgesLehmann(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return NaN
  const diffs: number[] = []
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) diffs.push(b[j] - a[i])
  return median(diffs)
}

/** Benjamini–Hochberg adjusted p-values (q-values), preserving input order. */
export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const m = pValues.length
  const order = pValues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p)
  const q = new Array<number>(m)
  let prev = 1
  for (let k = m - 1; k >= 0; k--) {
    const val = Math.min(prev, (order[k].p * m) / (k + 1))
    q[order[k].i] = val
    prev = val
  }
  return q
}

// ---------------------------------------------------------------- matrices

/** Gauss–Jordan inverse of a small symmetric matrix. Returns null when singular. */
export function invertMatrix(m: readonly (readonly number[])[]): number[][] | null {
  const n = m.length
  const a: number[][] = m.map((row, i) => {
    const r = new Array<number>(2 * n).fill(0)
    for (let j = 0; j < n; j++) r[j] = row[j]
    r[n + i] = 1
    return r
  })
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    if (Math.abs(a[pivot][col]) < 1e-10) return null
    if (pivot !== col) {
      const tmp = a[pivot]
      a[pivot] = a[col]
      a[col] = tmp
    }
    const p = a[col][col]
    for (let j = 0; j < 2 * n; j++) a[col][j] /= p
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j]
    }
  }
  return a.map((row) => row.slice(n))
}

/** Quadratic form vᵀ M v. */
export function quadraticForm(v: readonly number[], m: readonly (readonly number[])[]): number {
  let s = 0
  for (let i = 0; i < v.length; i++) {
    let row = 0
    for (let j = 0; j < v.length; j++) row += m[i][j] * v[j]
    s += v[i] * row
  }
  return s
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
