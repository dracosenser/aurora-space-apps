import { linkKey } from './layout'

/**
 * Interaction state for the SIGNAL VEIL experience, as a pure reducer so every
 * transition (fog, selection, connections, timeline, replay) is testable.
 */

export type PanelId = 'signal' | 'relationship' | 'insights' | 'response'

export interface ReplayPlan {
  fromDay: number
  toDay: number
  /** Day on which to pause briefly (the day the engine reported the pattern). */
  holdDay: number | null
  label: string
}

export interface VeilState {
  day: number
  totalDays: number
  /** Indicator ids in dataset order (defines canonical relationship ids). */
  order: string[]
  playing: boolean
  /** Days advanced per second while playing. */
  speed: number
  replay: ReplayPlan | null
  selectedId: string | null
  connection: { a: string; b: string } | null
  /** Relationship ids the user has drawn. Drawing reveals an engine result; it never creates one. */
  revealedLinks: string[]
  fogRevealed: number
  fogCleared: boolean
  /** Incremented to tell the renderer to re-fog the glass. */
  fogEpoch: number
  /** Incremented to tell the renderer to dissolve whatever fog remains. */
  clearEpoch: number
  brush: number
  lens: boolean
  panel: PanelId
}

export type VeilAction =
  | { type: 'set-day'; day: number }
  | { type: 'step'; delta: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle-play' }
  | { type: 'tick'; days: number }
  | { type: 'set-speed'; speed: number }
  | { type: 'reset-timeline' }
  | { type: 'start-replay'; plan: ReplayPlan }
  | { type: 'stop-replay' }
  | { type: 'select'; id: string | null }
  | { type: 'connect'; a: string; b: string }
  | { type: 'clear-connection' }
  | { type: 'forget-links' }
  | { type: 'fog-progress'; revealed: number }
  | { type: 'fog-clear' }
  | { type: 'fog-reset' }
  | { type: 'set-brush'; brush: number }
  | { type: 'toggle-lens' }
  | { type: 'set-lens'; on: boolean }
  | { type: 'set-panel'; panel: PanelId }
  | { type: 'reset-all'; day: number }

/** Share of the glass that must be wiped before the remaining fog dissolves on its own. */
export const AUTO_CLEAR_AT = 0.8
export const BRUSH_RANGE: [number, number] = [28, 140]
export const SPEEDS = [3, 6, 12, 24]

export function initialVeilState(totalDays: number, order: string[], startDay = totalDays): VeilState {
  return {
    day: clampDay(startDay, totalDays),
    totalDays,
    order,
    playing: false,
    speed: 6,
    replay: null,
    selectedId: null,
    connection: null,
    revealedLinks: [],
    fogRevealed: 0,
    fogCleared: false,
    fogEpoch: 0,
    clearEpoch: 0,
    brush: 72,
    lens: false,
    panel: 'insights',
  }
}

function clampDay(day: number, total: number): number {
  return Math.min(total, Math.max(1, Math.round(day)))
}

export function veilReducer(state: VeilState, action: VeilAction): VeilState {
  switch (action.type) {
    case 'set-day':
      // Scrubbing by hand takes over from any replay in progress.
      return { ...state, day: clampDay(action.day, state.totalDays), playing: false, replay: null }
    case 'step':
      return { ...state, day: clampDay(state.day + action.delta, state.totalDays), playing: false, replay: null }
    case 'play': {
      const end = state.replay ? state.replay.toDay : state.totalDays
      // Starting from the end restarts from the beginning.
      const day = state.day >= end ? (state.replay ? state.replay.fromDay : 1) : state.day
      return { ...state, day, playing: true }
    }
    case 'pause':
      return { ...state, playing: false }
    case 'toggle-play':
      return veilReducer(state, { type: state.playing ? 'pause' : 'play' })
    case 'tick': {
      if (!state.playing) return state
      const end = state.replay ? state.replay.toDay : state.totalDays
      const day = Math.min(end, state.day + Math.max(1, Math.round(action.days)))
      if (day >= end) return { ...state, day: end, playing: false, replay: null }
      return { ...state, day }
    }
    case 'set-speed':
      return { ...state, speed: action.speed }
    case 'reset-timeline':
      return { ...state, day: 1, playing: false, replay: null }
    case 'start-replay': {
      const from = clampDay(action.plan.fromDay, state.totalDays)
      const to = clampDay(action.plan.toDay, state.totalDays)
      if (to <= from) return state
      return { ...state, replay: { ...action.plan, fromDay: from, toDay: to }, day: from, playing: true, panel: 'insights', connection: null }
    }
    case 'stop-replay':
      return { ...state, replay: null, playing: false }
    case 'select':
      return { ...state, selectedId: action.id, connection: action.id ? null : state.connection, panel: action.id ? 'signal' : state.panel }
    case 'connect': {
      if (action.a === action.b) return state
      if (!state.order.includes(action.a) || !state.order.includes(action.b)) return state
      const key = linkKey(action.a, action.b, state.order)
      return {
        ...state,
        connection: { a: action.a, b: action.b },
        revealedLinks: state.revealedLinks.includes(key) ? state.revealedLinks : [...state.revealedLinks, key],
        selectedId: null,
        panel: 'relationship',
      }
    }
    case 'clear-connection':
      return { ...state, connection: null }
    case 'forget-links':
      return { ...state, connection: null, revealedLinks: [] }
    case 'fog-progress': {
      if (state.fogCleared) return state
      const revealed = Math.min(1, Math.max(0, action.revealed))
      if (revealed >= AUTO_CLEAR_AT) return { ...state, fogRevealed: 1, fogCleared: true, clearEpoch: state.clearEpoch + 1 }
      return { ...state, fogRevealed: revealed }
    }
    case 'fog-clear':
      return state.fogCleared ? state : { ...state, fogRevealed: 1, fogCleared: true, clearEpoch: state.clearEpoch + 1 }
    case 'fog-reset':
      return { ...state, fogRevealed: 0, fogCleared: false, fogEpoch: state.fogEpoch + 1, lens: false }
    case 'set-brush':
      return { ...state, brush: Math.min(BRUSH_RANGE[1], Math.max(BRUSH_RANGE[0], action.brush)) }
    case 'toggle-lens':
      return { ...state, lens: !state.lens }
    case 'set-lens':
      return { ...state, lens: action.on }
    case 'set-panel':
      return { ...state, panel: action.panel }
    case 'reset-all':
      return { ...initialVeilState(state.totalDays, state.order, action.day), fogEpoch: state.fogEpoch + 1, clearEpoch: state.clearEpoch }
    default:
      return state
  }
}
