/**
 * The airlock.
 *
 * A two-hatch chamber between the pressurised station and vacuum, modelled as
 * an explicit state machine rather than as a screen with a button on it. The
 * sequence a crew member has to go through — seal the inner hatch, confirm the
 * suit, pre-breathe, pump the chamber down, unlock the outer hatch — is the
 * actual subject here, so every step of it is a state with its own entry
 * condition, and nothing can be skipped by walking somewhere.
 *
 * This module is deliberately free of rendering, React and the DOM. It is the
 * one piece of the EVA system where a mistake would be dangerous if any of
 * this were real, so it is written to be exhaustively testable: states are
 * data, transitions are a pure function, and the safety properties are
 * expressed as predicates that a test can enumerate over every state.
 *
 * ── On realism ────────────────────────────────────────────────────────────
 * This is a simplified simulation for an educational tool, and the interface
 * says so wherever it surfaces a number. The structure follows the real
 * article — the ISS Quest airlock is genuinely two chambers with an equipment
 * lock and a crew lock, and an EMU denitrogenation protocol genuinely does
 * precede every US spacewalk — but the durations here are compressed by
 * roughly two orders of magnitude, the pressure curve is linear where a real
 * pump-down is not, and no gas dynamics, suit consumable or thermal model
 * exists. Nothing here is a procedure and nothing here is flight-rated.
 */

export type AirlockState =
  | 'idle'
  | 'crew-entering'
  | 'inner-hatch-closing'
  | 'inner-hatch-locked'
  | 'suit-final-check'
  | 'prebreathe'
  | 'depress-ready'
  | 'depressurizing'
  | 'vacuum-ready'
  | 'outer-hatch-unlocking'
  | 'outer-hatch-open'
  | 'eva-active'
  | 'crew-returning'
  | 'outer-hatch-closing'
  | 'repressurizing'
  | 'pressure-equalized'
  | 'inner-hatch-unlocking'
  | 'crew-reentering'
  | 'post-eva'

/** What a hatch is doing. Only `open` lets a body through. */
export type HatchState = 'locked' | 'closed' | 'opening' | 'open' | 'closing'

export type AirlockCommand =
  | 'enter'
  | 'close-inner'
  | 'confirm-suit'
  | 'begin-prebreathe'
  | 'begin-depress'
  | 'open-outer'
  | 'egress'
  | 'return'
  | 'close-outer'
  | 'begin-repress'
  | 'open-inner'
  | 'ingress'
  | 'finish'
  | 'abort'

/** Station atmosphere, kPa. 101.3 is one standard atmosphere. */
export const CABIN_KPA = 101.3
/** Below this the outer hatch is cleared to unlock. */
export const VACUUM_KPA = 0.5
/** At or above this the inner hatch is cleared to unlock. */
export const EQUALISED_KPA = 100.6

export interface Airlock {
  state: AirlockState
  /** Simulated chamber pressure, kPa. */
  kpa: number
  /** Seconds spent in the current timed phase. */
  t: number
  /** Seconds the crew member has been outside. Drives the post-EVA review. */
  evaSeconds: number
  /** Raised when a command was refused, for the panel to explain why. */
  refusal: string | null
}

export function newAirlock(): Airlock {
  return { state: 'idle', kpa: CABIN_KPA, t: 0, evaSeconds: 0, refusal: null }
}

/**
 * Phases that run on a clock rather than on a command, and how long each takes
 * in this simulation. A real crew lock pump-down is several minutes and a real
 * denitrogenation protocol is hours; these are compressed to what someone will
 * actually sit through, and the panel labels them as compressed.
 */
const TIMED: Partial<Record<AirlockState, number>> = {
  'inner-hatch-closing': 3.5,
  prebreathe: 14,
  depressurizing: 18,
  'outer-hatch-unlocking': 2.5,
  'outer-hatch-closing': 3.5,
  repressurizing: 20,
  'inner-hatch-unlocking': 2.5,
}

/** Where a timed phase goes when its clock runs out. */
const AFTER: Partial<Record<AirlockState, AirlockState>> = {
  'inner-hatch-closing': 'inner-hatch-locked',
  prebreathe: 'depress-ready',
  depressurizing: 'vacuum-ready',
  'outer-hatch-unlocking': 'outer-hatch-open',
  'outer-hatch-closing': 'repressurizing',
  repressurizing: 'pressure-equalized',
  'inner-hatch-unlocking': 'crew-reentering',
}

export function phaseSeconds(s: AirlockState): number {
  return TIMED[s] ?? 0
}

/** 0..1 through the current timed phase; 0 for states that wait on a command. */
export function phaseProgress(a: Airlock): number {
  const total = phaseSeconds(a.state)
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, a.t / total))
}

// ----------------------------------------------------------------- hatches
/**
 * The inner hatch, onto the station.
 *
 * Note which states are absent: everything from `inner-hatch-locked` through
 * `crew-returning` keeps this locked, which is the whole point of the
 * chamber. See `bothHatchesOpen` for the property this is supposed to give.
 */
export function innerHatch(s: AirlockState): HatchState {
  switch (s) {
    case 'idle':
      return 'closed'
    case 'crew-entering':
    case 'crew-reentering':
    case 'post-eva':
      return 'open'
    case 'inner-hatch-closing':
      return 'closing'
    case 'inner-hatch-unlocking':
      return 'opening'
    default:
      return 'locked'
  }
}

/** The outer hatch, onto vacuum. */
export function outerHatch(s: AirlockState): HatchState {
  switch (s) {
    case 'outer-hatch-open':
    case 'eva-active':
    case 'crew-returning':
      return 'open'
    case 'outer-hatch-unlocking':
      return 'opening'
    case 'outer-hatch-closing':
      return 'closing'
    default:
      return 'locked'
  }
}

/**
 * The safety property. A test enumerates every state through this, so the
 * machine cannot acquire a state that breaks it without the suite noticing.
 */
export function bothHatchesOpen(s: AirlockState): boolean {
  const i = innerHatch(s)
  const o = outerHatch(s)
  const iOpen = i === 'open' || i === 'opening'
  const oOpen = o === 'open' || o === 'opening'
  return iOpen && oOpen
}

/** True while the crew member is outside the hull. */
export function isOutside(s: AirlockState): boolean {
  return s === 'eva-active' || s === 'crew-returning'
}

/** True while the chamber is not at station pressure: movement is suited. */
export function isSuited(s: AirlockState): boolean {
  return s !== 'idle' && s !== 'crew-entering' && s !== 'post-eva'
}

// ---------------------------------------------------------------- commands
/**
 * What a crew member can do from here, and why not.
 *
 * Returning the reason rather than a boolean is what lets the airlock panel
 * say "the chamber is still at 42 kPa" instead of greying a button out with no
 * explanation, which is the difference between a simulation and a form.
 */
export function refuse(a: Airlock, c: AirlockCommand, ready: boolean): string | null {
  switch (c) {
    case 'enter':
      return a.state === 'idle' ? null : 'The airlock is already in use.'
    case 'close-inner':
      if (a.state !== 'crew-entering') return 'The inner hatch is not open.'
      return ready ? null : 'Complete the suit preparation before sealing the hatch.'
    case 'confirm-suit':
      return a.state === 'inner-hatch-locked' ? null : 'The inner hatch is not sealed.'
    case 'begin-prebreathe':
      return a.state === 'suit-final-check' ? null : 'The suit check is not complete.'
    case 'begin-depress':
      return a.state === 'depress-ready' ? null : 'Pre-breathe is not complete.'
    case 'open-outer':
      if (a.state !== 'vacuum-ready') return 'Depressurisation is not complete.'
      if (a.kpa > VACUUM_KPA) return `The chamber is still at ${a.kpa.toFixed(1)} kPa.`
      if (innerHatch(a.state) !== 'locked') return 'The inner hatch is not locked.'
      return null
    case 'egress':
      return a.state === 'outer-hatch-open' ? null : 'The outer hatch is not open.'
    case 'return':
      return a.state === 'eva-active' ? null : 'Not currently outside.'
    case 'close-outer':
      return a.state === 'crew-returning' ? null : 'Not in the chamber.'
    case 'begin-repress':
      return a.state === 'repressurizing' ? null : 'The outer hatch is not sealed.'
    case 'open-inner':
      if (a.state !== 'pressure-equalized') return 'Repressurisation is not complete.'
      if (a.kpa < EQUALISED_KPA) return `The chamber is still at ${a.kpa.toFixed(1)} kPa.`
      if (outerHatch(a.state) !== 'locked') return 'The outer hatch is not locked.'
      return null
    case 'ingress':
      return a.state === 'crew-reentering' ? null : 'The inner hatch is not open.'
    case 'finish':
      return a.state === 'post-eva' ? null : 'No spacewalk to close out.'
    case 'abort':
      return isOutside(a.state) || a.state === 'outer-hatch-open' ? null : 'Nothing to abort.'
  }
}

const GOES: Partial<Record<AirlockCommand, AirlockState>> = {
  enter: 'crew-entering',
  'close-inner': 'inner-hatch-closing',
  'confirm-suit': 'suit-final-check',
  'begin-prebreathe': 'prebreathe',
  'begin-depress': 'depressurizing',
  'open-outer': 'outer-hatch-unlocking',
  egress: 'eva-active',
  return: 'crew-returning',
  'close-outer': 'outer-hatch-closing',
  'begin-repress': 'repressurizing',
  'open-inner': 'inner-hatch-unlocking',
  ingress: 'post-eva',
  finish: 'idle',
}

/**
 * Apply a crew command. Pure: returns a new airlock, or the same one with a
 * refusal set. `ready` is whether suit preparation is complete, which the
 * machine does not track itself — the suit is its own model.
 */
export function command(a: Airlock, c: AirlockCommand, ready = true): Airlock {
  const why = refuse(a, c, ready)
  if (why) return { ...a, refusal: why }
  if (c === 'abort') {
    // Straight back to the chamber with the outer hatch shut. An abort skips
    // the return traverse, not any part of the pressure sequence.
    return { ...a, state: 'outer-hatch-closing', t: 0, refusal: null }
  }
  const next = GOES[c]
  if (!next) return a
  if (c === 'finish') return { ...newAirlock(), evaSeconds: a.evaSeconds }
  return { ...a, state: next, t: 0, refusal: null }
}

/**
 * Advance the clock. Timed phases move themselves along; pressure tracks the
 * phase it belongs to so the gauge and the state can never disagree.
 */
export function advance(a: Airlock, dt: number): Airlock {
  const total = phaseSeconds(a.state)
  let t = a.t + dt
  let state = a.state
  let kpa = a.kpa
  const eva = a.evaSeconds + (isOutside(a.state) ? dt : 0)

  if (a.state === 'depressurizing') {
    const k = Math.min(1, t / (total || 1))
    // Eased rather than linear: a pump moves the last few kPa far more slowly
    // than the first few, which is the part of a real pump-down anyone who has
    // watched one would recognise.
    kpa = CABIN_KPA * Math.pow(1 - k, 2.4)
    if (k >= 1) kpa = 0
  } else if (a.state === 'repressurizing') {
    const k = Math.min(1, t / (total || 1))
    kpa = CABIN_KPA * (1 - Math.pow(1 - k, 1.8))
    if (k >= 1) kpa = CABIN_KPA
  }

  if (total > 0 && t >= total) {
    const after = AFTER[a.state]
    if (after) {
      state = after
      t = 0
    }
  }
  return { ...a, state, t, kpa, evaSeconds: eva }
}

/** One line of status, for the chamber display and the HUD. */
export function statusLine(a: Airlock): string {
  switch (a.state) {
    case 'idle': return 'Chamber at station pressure. Inner hatch unlocked.'
    case 'crew-entering': return 'Inner hatch open. Enter the chamber.'
    case 'inner-hatch-closing': return 'Inner hatch closing.'
    case 'inner-hatch-locked': return 'Inner hatch sealed and locked.'
    case 'suit-final-check': return 'Final suit check before denitrogenation.'
    case 'prebreathe': return 'Denitrogenation in progress (compressed).'
    case 'depress-ready': return 'Pre-breathe complete. Ready to depressurise.'
    case 'depressurizing': return 'Depressurising chamber.'
    case 'vacuum-ready': return 'Chamber at vacuum. Outer hatch cleared to unlock.'
    case 'outer-hatch-unlocking': return 'Outer hatch unlocking.'
    case 'outer-hatch-open': return 'Outer hatch open. Cleared to egress.'
    case 'eva-active': return 'Crew outside. Tether attached.'
    case 'crew-returning': return 'Crew back in the chamber.'
    case 'outer-hatch-closing': return 'Outer hatch closing.'
    case 'repressurizing': return 'Repressurising chamber.'
    case 'pressure-equalized': return 'Pressure equalised with the station.'
    case 'inner-hatch-unlocking': return 'Inner hatch unlocking.'
    case 'crew-reentering': return 'Inner hatch open. Return to the station.'
    case 'post-eva': return 'Spacewalk complete. Post-EVA review available.'
  }
}

export const ALL_AIRLOCK_STATES: AirlockState[] = [
  'idle', 'crew-entering', 'inner-hatch-closing', 'inner-hatch-locked',
  'suit-final-check', 'prebreathe', 'depress-ready', 'depressurizing',
  'vacuum-ready', 'outer-hatch-unlocking', 'outer-hatch-open', 'eva-active',
  'crew-returning', 'outer-hatch-closing', 'repressurizing',
  'pressure-equalized', 'inner-hatch-unlocking', 'crew-reentering', 'post-eva',
]

/**
 * How far each hatch leaf has swung, 0 shut to 1 fully open.
 *
 * Derived from the state and its phase rather than animated separately, so
 * the leaf the renderer draws and the barrier `moveWithCollision` enforces are
 * the same number. A hatch that looked open while still blocking, or blocked
 * while looking open, would be the most annoying possible bug here.
 */
export function hatchOpenness(a: Airlock): { inner: number; outer: number } {
  const k = phaseProgress(a)
  const of = (h: HatchState): number => {
    switch (h) {
      case 'open': return 1
      case 'opening': return k
      case 'closing': return 1 - k
      default: return 0
    }
  }
  return { inner: of(innerHatch(a.state)), outer: of(outerHatch(a.state)) }
}

/**
 * How far open a leaf has to be before a body fits through it.
 *
 * Deciding this from the same number the renderer draws, rather than from the
 * state name, is what keeps the two honest. Keying it to the name instead made
 * a hatch block from the first instant of `closing`, while the leaf was still
 * drawn wide open — so a crew member walked into something they could see plainly
 * was not there.
 */
export const PASSABLE = 0.82

/** Hatches that currently block passage, by how far their leaf has swung. */
export function shutDoors(a: Airlock): Set<string> {
  const open = hatchOpenness(a)
  const out = new Set<string>()
  if (open.inner < PASSABLE) out.add('inner-hatch')
  if (open.outer < PASSABLE) out.add('outer-hatch')
  return out
}
