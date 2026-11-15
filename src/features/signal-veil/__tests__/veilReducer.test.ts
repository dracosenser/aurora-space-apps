import { describe, expect, it } from 'vitest'
import { AUTO_CLEAR_AT, BRUSH_RANGE, initialVeilState, veilReducer, type ReplayPlan, type VeilAction, type VeilState } from '../model/veilReducer'

const ORDER = ['hr', 'sleep', 'fatigue', 'exercise']
const start = (day = 100) => initialVeilState(150, ORDER, day)
const run = (state: VeilState, ...actions: VeilAction[]) => actions.reduce(veilReducer, state)
const PLAN: ReplayPlan = { fromDay: 52, toDay: 114, holdDay: 88, label: 'CP-082' }

describe('fog reveal and reset state', () => {
  it('starts fogged', () => {
    const s = start()
    expect(s.fogRevealed).toBe(0)
    expect(s.fogCleared).toBe(false)
  })

  it('records wiping progress', () => {
    const s = run(start(), { type: 'fog-progress', revealed: 0.31 })
    expect(s.fogRevealed).toBe(0.31)
    expect(s.fogCleared).toBe(false)
    expect(s.clearEpoch).toBe(0)
  })

  it('dissolves the remaining fog once most of the glass has been wiped', () => {
    const s = run(start(), { type: 'fog-progress', revealed: AUTO_CLEAR_AT + 0.01 })
    expect(s.fogCleared).toBe(true)
    expect(s.fogRevealed).toBe(1)
    expect(s.clearEpoch).toBe(1)
    // Further progress reports are ignored once clear.
    expect(run(s, { type: 'fog-progress', revealed: 0.2 })).toBe(s)
  })

  it('clears on request, once', () => {
    const s = run(start(), { type: 'fog-clear' })
    expect(s.fogCleared).toBe(true)
    expect(s.clearEpoch).toBe(1)
    expect(run(s, { type: 'fog-clear' })).toBe(s)
  })

  it('re-fogs the visor on reset and turns the lens off', () => {
    const s = run(start(), { type: 'fog-clear' }, { type: 'toggle-lens' }, { type: 'fog-reset' })
    expect(s.fogCleared).toBe(false)
    expect(s.fogRevealed).toBe(0)
    expect(s.fogEpoch).toBe(1)
    expect(s.lens).toBe(false)
  })

  it('keeps the brush radius within range', () => {
    expect(run(start(), { type: 'set-brush', brush: 5 }).brush).toBe(BRUSH_RANGE[0])
    expect(run(start(), { type: 'set-brush', brush: 999 }).brush).toBe(BRUSH_RANGE[1])
    expect(run(start(), { type: 'set-brush', brush: 90 }).brush).toBe(90)
  })
})

describe('node selection', () => {
  it('selects a signal and opens its panel', () => {
    const s = run(start(), { type: 'select', id: 'sleep' })
    expect(s.selectedId).toBe('sleep')
    expect(s.panel).toBe('signal')
  })

  it('deselects without changing the panel', () => {
    const s = run(start(), { type: 'select', id: 'sleep' }, { type: 'set-panel', panel: 'insights' }, { type: 'select', id: null })
    expect(s.selectedId).toBeNull()
    expect(s.panel).toBe('insights')
  })

  it('replaces an inspected relationship when a signal is selected', () => {
    const s = run(start(), { type: 'connect', a: 'sleep', b: 'fatigue' }, { type: 'select', id: 'hr' })
    expect(s.connection).toBeNull()
    expect(s.revealedLinks).toEqual(['sleep~fatigue'])
  })
})

describe('connection selection', () => {
  it('reveals the drawn pair and opens the relationship panel', () => {
    const s = run(start(), { type: 'select', id: 'sleep' }, { type: 'connect', a: 'sleep', b: 'fatigue' })
    expect(s.connection).toEqual({ a: 'sleep', b: 'fatigue' })
    expect(s.revealedLinks).toEqual(['sleep~fatigue'])
    expect(s.panel).toBe('relationship')
    expect(s.selectedId).toBeNull()
  })

  it('uses one canonical id whichever way the line is drawn', () => {
    const s = run(start(), { type: 'connect', a: 'fatigue', b: 'sleep' }, { type: 'connect', a: 'sleep', b: 'fatigue' })
    expect(s.revealedLinks).toEqual(['sleep~fatigue'])
  })

  it('ignores a line from a signal to itself or to an unknown signal', () => {
    const s0 = start()
    expect(run(s0, { type: 'connect', a: 'sleep', b: 'sleep' })).toBe(s0)
    expect(run(s0, { type: 'connect', a: 'sleep', b: 'nope' })).toBe(s0)
  })

  it('accumulates drawn lines and can forget them', () => {
    const s = run(start(), { type: 'connect', a: 'sleep', b: 'fatigue' }, { type: 'connect', a: 'hr', b: 'exercise' })
    expect(s.revealedLinks).toEqual(['sleep~fatigue', 'hr~exercise'])
    const cleared = run(s, { type: 'forget-links' })
    expect(cleared.revealedLinks).toEqual([])
    expect(cleared.connection).toBeNull()
  })

  it('drawing a line stores only which pair was drawn, never a result', () => {
    const s = run(start(), { type: 'connect', a: 'hr', b: 'exercise' })
    expect(Object.keys(s.connection!)).toEqual(['a', 'b'])
    expect(s.revealedLinks.every((k) => typeof k === 'string')).toBe(true)
  })
})

describe('timeline', () => {
  it('scrubs to a day within the mission', () => {
    expect(run(start(), { type: 'set-day', day: 42 }).day).toBe(42)
    expect(run(start(), { type: 'set-day', day: -5 }).day).toBe(1)
    expect(run(start(), { type: 'set-day', day: 9999 }).day).toBe(150)
    expect(run(start(), { type: 'set-day', day: 42.6 }).day).toBe(43)
  })

  it('steps one day at a time', () => {
    expect(run(start(100), { type: 'step', delta: 1 }).day).toBe(101)
    expect(run(start(1), { type: 'step', delta: -1 }).day).toBe(1)
  })

  it('plays, ticks forward and stops at the end', () => {
    let s = run(start(148), { type: 'play' })
    expect(s.playing).toBe(true)
    s = run(s, { type: 'tick', days: 1 })
    expect(s.day).toBe(149)
    s = run(s, { type: 'tick', days: 1 })
    expect(s.day).toBe(150)
    expect(s.playing).toBe(false)
  })

  it('does not advance while paused', () => {
    const s = run(start(60), { type: 'tick', days: 1 })
    expect(s.day).toBe(60)
    const paused = run(start(60), { type: 'play' }, { type: 'pause' }, { type: 'tick', days: 1 })
    expect(paused.day).toBe(60)
  })

  it('restarts from day 1 when play is pressed at the end', () => {
    const s = run(start(150), { type: 'play' })
    expect(s.day).toBe(1)
    expect(s.playing).toBe(true)
  })

  it('resets to day 1 and stops', () => {
    const s = run(start(90), { type: 'play' }, { type: 'reset-timeline' })
    expect(s.day).toBe(1)
    expect(s.playing).toBe(false)
  })

  it('toggles and changes speed', () => {
    const s = run(start(60), { type: 'toggle-play' }, { type: 'set-speed', speed: 24 })
    expect(s.playing).toBe(true)
    expect(s.speed).toBe(24)
    expect(run(s, { type: 'toggle-play' }).playing).toBe(false)
  })
})

describe('replay', () => {
  it('jumps to the start of the plan and plays', () => {
    const s = run(start(140), { type: 'start-replay', plan: PLAN })
    expect(s.day).toBe(52)
    expect(s.playing).toBe(true)
    expect(s.replay).toEqual(PLAN)
    expect(s.panel).toBe('insights')
  })

  it('advances day by day and ends at the plan\'s last day', () => {
    let s = run(start(140), { type: 'start-replay', plan: PLAN })
    const seen: number[] = []
    for (let i = 0; i < 200 && s.playing; i++) {
      s = run(s, { type: 'tick', days: 1 })
      seen.push(s.day)
    }
    expect(seen[0]).toBe(53)
    expect(seen).toContain(88)
    expect(s.day).toBe(114)
    expect(s.playing).toBe(false)
    expect(s.replay).toBeNull()
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBe(seen[i - 1] + 1)
  })

  it('can be paused and resumed without losing its place', () => {
    let s = run(start(140), { type: 'start-replay', plan: PLAN }, { type: 'tick', days: 1 }, { type: 'pause' })
    expect(s.day).toBe(53)
    expect(s.replay).not.toBeNull()
    s = run(s, { type: 'play' }, { type: 'tick', days: 1 })
    expect(s.day).toBe(54)
  })

  it('is cancelled by scrubbing by hand', () => {
    const s = run(start(140), { type: 'start-replay', plan: PLAN }, { type: 'set-day', day: 100 })
    expect(s.replay).toBeNull()
    expect(s.playing).toBe(false)
    expect(s.day).toBe(100)
  })

  it('stops on request and ignores an empty plan', () => {
    const s = run(start(140), { type: 'start-replay', plan: PLAN }, { type: 'stop-replay' })
    expect(s.replay).toBeNull()
    expect(s.playing).toBe(false)
    const s0 = start(140)
    expect(run(s0, { type: 'start-replay', plan: { ...PLAN, fromDay: 90, toDay: 90 } })).toBe(s0)
  })
})

describe('full reset', () => {
  it('returns every interaction to its starting state and re-fogs the visor', () => {
    const dirty = run(
      start(100),
      { type: 'fog-clear' },
      { type: 'select', id: 'hr' },
      { type: 'connect', a: 'sleep', b: 'fatigue' },
      { type: 'toggle-lens' },
      { type: 'set-day', day: 30 },
      { type: 'play' },
    )
    const s = run(dirty, { type: 'reset-all', day: 115 })
    expect(s.day).toBe(115)
    expect(s.playing).toBe(false)
    expect(s.selectedId).toBeNull()
    expect(s.connection).toBeNull()
    expect(s.revealedLinks).toEqual([])
    expect(s.lens).toBe(false)
    expect(s.fogCleared).toBe(false)
    expect(s.fogRevealed).toBe(0)
    expect(s.fogEpoch).toBe(dirty.fogEpoch + 1)
  })
})
