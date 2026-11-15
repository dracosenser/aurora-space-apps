import { describe, expect, it } from 'vitest'
import { PointerController, type PointerEffect } from '../model/pointer'

/** Two signals: A at (100,100), B at (300,100). `revealed` says where the fog has been cleared. */
function setup(opts: { revealed?: (x: number, y: number) => boolean; lens?: boolean } = {}) {
  const nodes = [
    { id: 'A', x: 100, y: 100 },
    { id: 'B', x: 300, y: 100 },
  ]
  const state = { lens: opts.lens ?? false }
  const controller = new PointerController({
    hitNode: (x, y) => nodes.find((n) => Math.hypot(n.x - x, n.y - y) <= 20)?.id ?? null,
    isRevealed: opts.revealed ?? (() => true),
    lensActive: () => state.lens,
  })
  return { controller, state }
}

const types = (effects: PointerEffect[]) => effects.map((e) => e.type)

describe('pointer interpretation', () => {
  it('wipes when pressing and dragging on fog', () => {
    const { controller } = setup({ revealed: () => false })
    const down = controller.down(50, 200)
    expect(down).toEqual([{ type: 'wipe', x0: 50, y0: 200, x1: 50, y1: 200 }])
    const m1 = controller.move(80, 210)
    const m2 = controller.move(120, 230)
    expect(m1).toEqual([{ type: 'wipe', x0: 50, y0: 200, x1: 80, y1: 210 }])
    // Segments are continuous: each starts where the last one ended.
    expect(m2).toEqual([{ type: 'wipe', x0: 80, y0: 210, x1: 120, y1: 230 }])
    expect(controller.up(120, 230)).toEqual([])
    expect(controller.mode).toBe('idle')
  })

  it('cannot select a signal that is still hidden by fog', () => {
    const { controller } = setup({ revealed: () => false })
    expect(types(controller.down(100, 100))).toEqual(['wipe'])
    expect(controller.up(100, 100)).toEqual([])
  })

  it('selects a visible signal on a tap', () => {
    const { controller } = setup()
    expect(controller.down(102, 98)).toEqual([])
    expect(controller.up(103, 99)).toEqual([{ type: 'select', id: 'A' }])
  })

  it('treats a small jitter during a tap as a tap', () => {
    const { controller } = setup()
    controller.down(100, 100)
    expect(controller.move(103, 102)).toEqual([])
    expect(controller.up(103, 102)).toEqual([{ type: 'select', id: 'A' }])
  })

  it('draws a connection when dragging from one visible signal to another', () => {
    const { controller } = setup()
    controller.down(100, 100)
    const first = controller.move(140, 100)
    expect(types(first)).toEqual(['connect-start', 'connect-move'])
    expect(first[1]).toMatchObject({ from: 'A', over: null })
    const over = controller.move(298, 102)
    expect(over).toEqual([{ type: 'connect-move', from: 'A', x: 298, y: 102, over: 'B' }])
    expect(controller.up(298, 102)).toEqual([{ type: 'connect-end', from: 'A', to: 'B' }])
  })

  it('creates nothing when a connection is dropped on empty glass', () => {
    const { controller } = setup()
    controller.down(100, 100)
    controller.move(200, 200)
    expect(controller.up(200, 200)).toEqual([{ type: 'connect-end', from: 'A', to: null }])
  })

  it('does not connect a signal to itself', () => {
    const { controller } = setup()
    controller.down(100, 100)
    controller.move(160, 100)
    const back = controller.move(101, 101)
    expect(back[0]).toMatchObject({ type: 'connect-move', over: null })
    expect(controller.up(101, 101)).toEqual([{ type: 'connect-end', from: 'A', to: null }])
  })

  it('cannot connect to a signal still hidden by fog', () => {
    // Only the left half has been wiped.
    const { controller } = setup({ revealed: (x) => x < 200 })
    controller.down(100, 100)
    controller.move(300, 100)
    expect(controller.up(300, 100)).toEqual([{ type: 'connect-end', from: 'A', to: null }])
  })

  it('wipes rather than connects when the drag starts on empty glass', () => {
    const { controller } = setup()
    expect(types(controller.down(200, 300))).toEqual(['wipe'])
    expect(types(controller.move(300, 100))).toEqual(['wipe'])
    expect(controller.up(300, 100)).toEqual([])
  })

  it('dismisses the selection on a tap on clear, empty glass', () => {
    const { controller } = setup()
    controller.down(200, 300)
    expect(controller.up(200, 300)).toEqual([{ type: 'select', id: null }])
  })

  it('never wipes while the data lens is on, and still lets a tap select', () => {
    const { controller } = setup({ revealed: () => false, lens: true })
    expect(controller.down(100, 100)).toEqual([])
    expect(controller.mode).toBe('lens')
    expect(controller.move(104, 101)).toEqual([])
    expect(controller.up(104, 101)).toEqual([{ type: 'select', id: 'A' }])
    controller.down(50, 50)
    controller.move(250, 250)
    expect(controller.up(250, 250)).toEqual([])
  })

  it('abandons a connection cleanly when the pointer is cancelled', () => {
    const { controller } = setup()
    controller.down(100, 100)
    controller.move(180, 120)
    expect(controller.cancel()).toEqual([{ type: 'connect-end', from: 'A', to: null }])
    expect(controller.mode).toBe('idle')
    expect(controller.cancel()).toEqual([])
  })
})
