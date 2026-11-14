/** Deterministic seeded PRNG (mulberry32) so the demo data is reproducible. */
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** Approximately normal (Box-Muller). */
  const normal = (mean = 0, sd = 1) => {
    let u = 0
    let v = 0
    while (u === 0) u = next()
    while (v === 0) v = next()
    return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  }
  const range = (min: number, max: number) => min + (max - min) * next()
  return { next, normal, range }
}

export type Rng = ReturnType<typeof createRng>
