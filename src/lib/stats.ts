export function mean(values: number[]): number {
  if (values.length === 0) return NaN
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

export function std(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  let s = 0
  for (const v of values) s += (v - m) * (v - m)
  return Math.sqrt(s / (values.length - 1))
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Least-squares slope per unit of x (x = 0..n-1). */
export function slope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const xMean = (n - 1) / 2
  const yMean = mean(values)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) * (i - xMean)
  }
  return den === 0 ? 0 : num / den
}

export function zScore(value: number, baseline: number[]): number {
  const sd = std(baseline)
  if (!isFinite(sd) || sd < 1e-9) return 0
  return (value - mean(baseline)) / sd
}

export function rollingMean(values: number[], window: number): number[] {
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    const n = Math.min(i + 1, window)
    out.push(sum / n)
  }
  return out
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function round(v: number, decimals = 1): number {
  const f = Math.pow(10, decimals)
  return Math.round(v * f) / f
}
