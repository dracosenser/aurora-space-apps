/**
 * Pointer interpretation for SIGNAL VEIL, independent of the DOM.
 *
 * One gesture vocabulary serves mouse, pen and touch:
 *   - press on fog, or drag anywhere that is not a visible signal  → wipe
 *   - tap a visible signal                                          → inspect it
 *   - drag from one visible signal to another                       → test their relationship
 *   - with the data lens on, moving examines and never wipes
 */

export type PointerEffect =
  | { type: 'wipe'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'select'; id: string | null }
  | { type: 'connect-start'; from: string }
  | { type: 'connect-move'; from: string; x: number; y: number; over: string | null }
  | { type: 'connect-end'; from: string; to: string | null }

export interface PointerDeps {
  /** Id of a signal at this position, regardless of fog. */
  hitNode(x: number, y: number): string | null
  /** Whether the fog has been cleared enough at this position to interact with what is beneath. */
  isRevealed(x: number, y: number): boolean
  lensActive(): boolean
}

type Mode = 'idle' | 'wipe' | 'pending-node' | 'connect' | 'lens'

export class PointerController {
  mode: Mode = 'idle'
  private startX = 0
  private startY = 0
  private lastX = 0
  private lastY = 0
  private from: string | null = null
  private moved = false

  constructor(
    private readonly deps: PointerDeps,
    /** Movement in pixels below which a press is treated as a tap. */
    private readonly slop = 8,
  ) {}

  private visibleNode(x: number, y: number): string | null {
    return this.deps.isRevealed(x, y) ? this.deps.hitNode(x, y) : null
  }

  down(x: number, y: number): PointerEffect[] {
    this.startX = this.lastX = x
    this.startY = this.lastY = y
    this.moved = false
    if (this.deps.lensActive()) {
      this.mode = 'lens'
      return []
    }
    const node = this.visibleNode(x, y)
    if (node) {
      this.mode = 'pending-node'
      this.from = node
      return []
    }
    this.mode = 'wipe'
    return [{ type: 'wipe', x0: x, y0: y, x1: x, y1: y }]
  }

  move(x: number, y: number): PointerEffect[] {
    const out: PointerEffect[] = []
    const dx = x - this.startX
    const dy = y - this.startY
    if (dx * dx + dy * dy > this.slop * this.slop) this.moved = true
    if (this.mode === 'wipe') {
      out.push({ type: 'wipe', x0: this.lastX, y0: this.lastY, x1: x, y1: y })
    } else if (this.mode === 'pending-node' && this.moved && this.from) {
      this.mode = 'connect'
      out.push({ type: 'connect-start', from: this.from })
    }
    if (this.mode === 'connect' && this.from) {
      const over = this.visibleNode(x, y)
      out.push({ type: 'connect-move', from: this.from, x, y, over: over && over !== this.from ? over : null })
    }
    this.lastX = x
    this.lastY = y
    return out
  }

  up(x: number, y: number): PointerEffect[] {
    const mode = this.mode
    const from = this.from
    this.mode = 'idle'
    this.from = null
    if (mode === 'pending-node' && from) return [{ type: 'select', id: from }]
    if (mode === 'connect' && from) {
      const over = this.visibleNode(x, y)
      return [{ type: 'connect-end', from, to: over && over !== from ? over : null }]
    }
    if (mode === 'lens') {
      if (this.moved) return []
      return [{ type: 'select', id: this.deps.hitNode(x, y) }]
    }
    if (mode === 'wipe' && !this.moved && this.deps.isRevealed(x, y)) {
      // A tap on clear glass away from any signal dismisses the current selection.
      return [{ type: 'select', id: null }]
    }
    return []
  }

  cancel(): PointerEffect[] {
    const mode = this.mode
    const from = this.from
    this.mode = 'idle'
    this.from = null
    return mode === 'connect' && from ? [{ type: 'connect-end', from, to: null }] : []
  }
}
