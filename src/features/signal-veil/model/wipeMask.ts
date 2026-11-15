/**
 * The wipe mask: a low-resolution field recording how much condensation has
 * been cleared at each point (0 = fully fogged, 255 = wiped clear).
 *
 * It is a plain typed array with no DOM dependency. The WebGL renderer uploads
 * it as a texture and adds fine detail in the shader; the Canvas 2D fallback
 * reads it directly; tests exercise it in Node.
 */
export class WipeMask {
  readonly cols: number
  readonly rows: number
  readonly data: Uint8Array
  /** Incremented on every change so renderers know when to re-upload. */
  version = 0
  private sum = 0

  constructor(cols = 320, rows = 200) {
    this.cols = cols
    this.rows = rows
    this.data = new Uint8Array(cols * rows)
  }

  reset(): void {
    this.data.fill(0)
    this.sum = 0
    this.version++
  }

  clearAll(): void {
    this.data.fill(255)
    this.sum = 255 * this.data.length
    this.version++
  }

  /**
   * Stamp a soft circular brush.
   * @param x,y   centre in normalised [0,1] surface coordinates
   * @param radius brush radius as a fraction of the surface HEIGHT
   * @param aspect surface width / height, so the brush stays circular
   */
  stamp(x: number, y: number, radius: number, aspect: number, strength = 1): void {
    const { cols, rows, data } = this
    const ry = radius * rows
    const rx = (radius / aspect) * cols
    const cxp = x * cols
    const cyp = y * rows
    const x0 = Math.max(0, Math.floor(cxp - rx))
    const x1 = Math.min(cols - 1, Math.ceil(cxp + rx))
    const y0 = Math.max(0, Math.floor(cyp - ry))
    const y1 = Math.min(rows - 1, Math.ceil(cyp + ry))
    if (x1 < x0 || y1 < y0) return
    let changed = false
    for (let j = y0; j <= y1; j++) {
      const dy = (j + 0.5 - cyp) / ry
      for (let i = x0; i <= x1; i++) {
        const dx = (i + 0.5 - cxp) / rx
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d >= 1) continue
        // Fully clear inside 45% of the radius, feathered to nothing at the edge.
        let f = d <= 0.45 ? 1 : 1 - (d - 0.45) / 0.55
        f = f * f * (3 - 2 * f) * strength
        const idx = j * cols + i
        const old = data[idx]
        // Screen-style accumulation: overlapping strokes build up and never darken.
        const next = Math.min(255, Math.round(old + (255 - old) * f))
        if (next !== old) {
          data[idx] = next
          this.sum += next - old
          changed = true
        }
      }
    }
    if (changed) this.version++
  }

  /** Stamp along a segment so fast pointer moves leave a continuous trail. */
  stroke(x0: number, y0: number, x1: number, y1: number, radius: number, aspect: number, strength = 1): void {
    const dx = (x1 - x0) * aspect
    const dy = y1 - y0
    const dist = Math.sqrt(dx * dx + dy * dy)
    const step = Math.max(radius * 0.3, 1e-4)
    const n = Math.max(1, Math.ceil(dist / step))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      this.stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, aspect, strength)
    }
  }

  /** Cleared amount (0–1) at a normalised position. */
  valueAt(x: number, y: number): number {
    const i = Math.min(this.cols - 1, Math.max(0, Math.floor(x * this.cols)))
    const j = Math.min(this.rows - 1, Math.max(0, Math.floor(y * this.rows)))
    return this.data[j * this.cols + i] / 255
  }

  /** Share of the surface that has been cleared (0–1). */
  revealedFraction(): number {
    return this.sum / (255 * this.data.length)
  }
}
