/**
 * Which entry overlay the station should show, if any.
 *
 * This exists as a pure function rather than as a condition inline in the JSX
 * because it has now been got wrong three times, each time the same way, and
 * each time it was the single most visible bug in the build.
 *
 * The mistake is always to tie the overlay to pointer lock. Losing the pointer
 * is not an error state: the station releases it deliberately every time a
 * console or an EVA screen opens, because the crew member needs a cursor to
 * use the screen. An overlay keyed to `!locked` therefore reappears every time
 * anyone opens anything — which is precisely the "STEP ABOARD keeps coming
 * back" report.
 *
 * So the rule is written out as three separate ideas:
 *
 *   * `entered` — has anyone ever taken the controls? The full plate is a
 *     welcome, so it is shown once per session and never again.
 *   * something is open, or the camera is moving — a panel is up, or the
 *     camera is flying to or from a screen. Neither is a moment to ask the
 *     crew member to click anything.
 *   * `locked` — only then does it matter whether the pointer is captured.
 *
 * Adding a new kind of panel means adding it to `busy`. A test enumerates
 * every combination of these inputs and asserts the invariants below, so a new
 * panel that is forgotten here fails the suite rather than the user.
 */

export interface OverlayState {
  /** Has the crew member ever taken the controls this session? */
  entered: boolean
  /** Is the pointer captured by the canvas? */
  locked: boolean
  /** Is a console screen open? */
  consoleOpen: boolean
  /** Is an EVA screen — suit prep, airlock, worksite, post-EVA — open? */
  evaOpen: boolean
  /** Is the camera flying to or from a console? */
  flying: boolean
  /** Touch device: it gets its own controls and never these prompts. */
  touch: boolean
}

export type Overlay =
  /** The full welcome plate, covering the station. Once per session. */
  | 'plate'
  /** A small prompt at the bottom that does not cover anything. */
  | 'prompt'
  | 'none'

export function entryOverlay(s: OverlayState): Overlay {
  if (s.touch) return 'none'
  // Anything that legitimately holds the pointer, or moves the camera.
  const busy = s.consoleOpen || s.evaOpen || s.flying
  if (busy) return 'none'
  if (s.locked) return 'none'
  return s.entered ? 'prompt' : 'plate'
}
