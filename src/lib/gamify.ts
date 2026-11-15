import { CHECKS, bandFor, CHECK_BY_ID, type Band, type CheckId, type Reading } from '../data/selfcheck'

/**
 * The crew-readiness game layer: the daily protocol board, the points and
 * streak that reward running it, and the patches earned along the way.
 *
 * The stakes are real inside the simulation — readiness falls when the battery
 * is skipped, and the duty-period clock runs on real time so the window
 * genuinely closes while you are looking at it.
 */

export interface Protocol {
  id: string
  label: string
  detail: string
  points: number
  /** Minutes of the duty period this is expected to take. */
  minutes: number
  kind: 'battery' | 'exercise' | 'environment' | 'behavioral'
}

export const PROTOCOLS: Protocol[] = [
  {
    id: 'battery',
    label: 'Self-assessment battery',
    detail: 'Log all eight readings for the current mission day.',
    points: 50,
    minutes: 12,
    kind: 'battery',
  },
  {
    id: 'resistive',
    label: 'Resistive exercise block',
    detail: 'Prescribed load, full set. The only countermeasure that holds bone.',
    points: 35,
    minutes: 45,
    kind: 'exercise',
  },
  {
    id: 'aerobic',
    label: 'Aerobic block',
    detail: 'Assigned intensity, 30 minutes continuous.',
    points: 25,
    minutes: 30,
    kind: 'exercise',
  },
  {
    id: 'hydration',
    label: 'Fluid and electrolyte target',
    detail: 'Hit the daily intake target logged against the water recovery system.',
    points: 15,
    minutes: 5,
    kind: 'environment',
  },
  {
    id: 'shelter',
    label: 'Radiation shelter drill',
    detail: 'Transit to the shielded volume and confirm stow. Timed.',
    points: 30,
    minutes: 8,
    kind: 'environment',
  },
  {
    id: 'conference',
    label: 'Private crew conference',
    detail: 'A scheduled slot, used routinely. Behavioural health is a system, not an escalation.',
    points: 20,
    minutes: 20,
    kind: 'behavioral',
  },
]

export const PROTOCOL_BY_ID = Object.fromEntries(PROTOCOLS.map((p) => [p.id, p])) as Record<string, Protocol>

export interface Patch {
  id: string
  label: string
  detail: string
}

export const PATCHES: Patch[] = [
  { id: 'first-light', label: 'First Light', detail: 'Completed a full self-assessment battery.' },
  { id: 'steady-state', label: 'Steady State', detail: 'Three consecutive days of complete batteries.' },
  { id: 'full-sweep', label: 'Full Sweep', detail: 'Every reading in the nominal band in one battery.' },
  { id: 'vigilant', label: 'Vigilant', detail: 'Logged ten complete batteries.' },
  { id: 'no-drift', label: 'No Drift', detail: 'Seven consecutive days without a missed battery.' },
  { id: 'sheltered', label: 'Sheltered', detail: 'Completed the radiation shelter drill under time.' },
  { id: 'all-clear', label: 'All Clear', detail: 'Cleared every protocol on the board in one duty period.' },
]

export const PATCH_BY_ID = Object.fromEntries(PATCHES.map((p) => [p.id, p])) as Record<string, Patch>

/** The crew member's own log — persisted, and reset with the demo. */
export interface CrewLog {
  readings: Reading[]
  /** protocol id → mission day it was last cleared on. */
  cleared: Record<string, number>
  streak: number
  lastBatteryDay: number | null
  batteriesLogged: number
  points: number
  patches: string[]
  /** Real-clock ms at which the current duty period opened. */
  periodOpenedAt: number
}

export const EMPTY_LOG: CrewLog = {
  readings: [],
  cleared: {},
  streak: 0,
  lastBatteryDay: null,
  batteriesLogged: 0,
  points: 0,
  patches: [],
  periodOpenedAt: 0,
}

/** How long a duty period runs, in real milliseconds. */
export const PERIOD_MS = 15 * 60 * 1000

/** Readings taken for a given mission day, newest wins. */
export function readingsForDay(log: CrewLog, day: number): Partial<Record<CheckId, Reading>> {
  const out: Partial<Record<CheckId, Reading>> = {}
  for (const r of log.readings) {
    if (r.day !== day) continue
    const prev = out[r.id]
    if (!prev || r.at > prev.at) out[r.id] = r
  }
  return out
}

export function batteryComplete(log: CrewLog, day: number): boolean {
  const taken = readingsForDay(log, day)
  return CHECKS.every((c) => taken[c.id] !== undefined)
}

/** Worst band present in the day's readings, for the at-a-glance colour. */
export function worstBand(log: CrewLog, day: number): Band | null {
  const taken = readingsForDay(log, day)
  let worst: Band | null = null
  for (const c of CHECKS) {
    const r = taken[c.id]
    if (!r) continue
    const b = bandFor(c, r.value)
    if (b === 'caution') return 'caution'
    if (b === 'watch') worst = 'watch'
    else if (worst === null) worst = 'nominal'
  }
  return worst
}

export interface Readiness {
  score: number
  band: Band
  /** Plain-language reasons, best first. */
  drivers: string[]
}

/**
 * Crew readiness for the current duty period: how much of the protocol board
 * is cleared, weighted by how the day's readings came back. This is an
 * engagement score for the simulation — it is not a medical assessment.
 */
export function computeReadiness(log: CrewLog, day: number): Readiness {
  const taken = readingsForDay(log, day)
  const logged = CHECKS.filter((c) => taken[c.id] !== undefined).length
  const coverage = logged / CHECKS.length

  let bandPenalty = 0
  const offBand: string[] = []
  for (const c of CHECKS) {
    const r = taken[c.id]
    if (!r) continue
    const b = bandFor(c, r.value)
    if (b === 'watch') {
      bandPenalty += 4
      offBand.push(`${c.short} in watch band`)
    } else if (b === 'caution') {
      bandPenalty += 11
      offBand.push(`${c.short} needs attention`)
    }
  }

  const clearedCount = PROTOCOLS.filter((p) => log.cleared[p.id] === day).length
  const boardShare = clearedCount / PROTOCOLS.length

  const raw = 32 + coverage * 38 + boardShare * 30 - bandPenalty
  const score = Math.max(0, Math.min(100, Math.round(raw)))
  const band: Band = score >= 78 ? 'nominal' : score >= 55 ? 'watch' : 'caution'

  const drivers: string[] = []
  if (logged < CHECKS.length) drivers.push(`${CHECKS.length - logged} of ${CHECKS.length} readings still outstanding`)
  drivers.push(...offBand.slice(0, 3))
  if (clearedCount < PROTOCOLS.length) drivers.push(`${PROTOCOLS.length - clearedCount} protocols still open on the board`)
  if (!drivers.length) drivers.push('Board clear and every reading in band')

  return { score, band, drivers }
}

/** Points for a single logged reading, including the in-band bonus. */
export function pointsForReading(id: CheckId, value: number): number {
  const def = CHECK_BY_ID[id]
  return bandFor(def, value) === 'nominal' ? 14 : 10
}

/** Patches the log has earned but not yet been awarded. */
export function newlyEarned(log: CrewLog, day: number): string[] {
  const earned: string[] = []
  const has = (id: string) => log.patches.includes(id)
  const complete = batteryComplete(log, day)

  if (complete && !has('first-light')) earned.push('first-light')
  if (log.streak >= 3 && !has('steady-state')) earned.push('steady-state')
  if (log.streak >= 7 && !has('no-drift')) earned.push('no-drift')
  if (log.batteriesLogged >= 10 && !has('vigilant')) earned.push('vigilant')
  if (complete && worstBand(log, day) === 'nominal' && !has('full-sweep')) earned.push('full-sweep')
  if (log.cleared['shelter'] === day && !has('sheltered')) earned.push('sheltered')
  if (PROTOCOLS.every((p) => log.cleared[p.id] === day) && !has('all-clear')) earned.push('all-clear')

  return earned
}

/** Milliseconds left in the current duty period, floored at zero. */
export function periodRemaining(openedAt: number, now: number): number {
  if (!openedAt) return PERIOD_MS
  return Math.max(0, openedAt + PERIOD_MS - now)
}

export function fmtCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
