import type { MissionEventRecord, Provenance, RecordedAction } from '../engine/types'
import { CREW_COLORS, DEFAULT_INDICATORS } from './catalog'
import { ENV_SUBJECT, type MissionPhase, type ReadingRow, type Workspace, type WorkspaceCrew, type WorkspaceIndicator, type WorkspaceMission } from './types'

/**
 * Pure operations on a Workspace. Each returns a new Workspace and never
 * mutates its input, so the store, the UI and the tests share one definition
 * of what every edit means.
 */

export const MAX_MISSION_DAYS = 2000

export function emptyWorkspace(): Workspace {
  return {
    version: 1,
    mission: { name: 'My mission', destination: '', totalDays: 180, currentDay: 1 },
    crew: [],
    indicators: DEFAULT_INDICATORS.map((i) => ({ ...i })),
    readings: {},
    provenance: {},
    phases: [],
    events: [],
    actions: {},
    baseline: 'auto',
    updatedAt: 0,
  }
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)))

function touch(ws: Workspace): Workspace {
  return { ...ws, updatedAt: Date.now() }
}

function slug(text: string): string {
  return (
    text
      .trim()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_m, c: string) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^(.)/, (c) => c.toLowerCase()) || 'indicator'
  )
}

function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}${n}`)) n++
  return `${base}${n}`
}

// ------------------------------------------------------------------ mission

export function setMission(ws: Workspace, patch: Partial<WorkspaceMission>): Workspace {
  const next = { ...ws.mission, ...patch }
  next.totalDays = clampInt(next.totalDays, 1, MAX_MISSION_DAYS)
  next.currentDay = clampInt(next.currentDay, 1, MAX_MISSION_DAYS)
  // Logging past the planned end extends the plan rather than losing the day.
  if (next.currentDay > next.totalDays) next.totalDays = next.currentDay
  next.name = next.name.slice(0, 80)
  next.destination = next.destination.slice(0, 80)
  return touch({ ...ws, mission: next })
}

// --------------------------------------------------------------------- crew

export function addCrew(ws: Workspace, input: { name: string; role?: string }): Workspace {
  const name = input.name.trim().slice(0, 60)
  if (!name) return ws
  const ids = ws.crew.map((c) => c.id)
  let n = ws.crew.length + 1
  while (ids.includes(`C-${String(n).padStart(2, '0')}`)) n++
  const member: WorkspaceCrew = {
    id: `C-${String(n).padStart(2, '0')}`,
    name,
    role: (input.role ?? '').trim().slice(0, 60) || 'Crew member',
    color: CREW_COLORS[ws.crew.length % CREW_COLORS.length],
  }
  return touch({ ...ws, crew: [...ws.crew, member] })
}

export function updateCrew(ws: Workspace, id: string, patch: Partial<Pick<WorkspaceCrew, 'name' | 'role'>>): Workspace {
  if (!ws.crew.some((c) => c.id === id)) return ws
  return touch({
    ...ws,
    crew: ws.crew.map((c) => (c.id === id ? { ...c, name: (patch.name ?? c.name).slice(0, 60) || c.name, role: (patch.role ?? c.role).slice(0, 60) } : c)),
  })
}

/** Removing a crew member removes their measurements and recorded actions. */
export function removeCrew(ws: Workspace, id: string): Workspace {
  if (!ws.crew.some((c) => c.id === id)) return ws
  const { [id]: _r, ...readings } = ws.readings
  const { [id]: _p, ...provenance } = ws.provenance
  const { [id]: _a, ...actions } = ws.actions
  void _r
  void _p
  void _a
  return touch({ ...ws, crew: ws.crew.filter((c) => c.id !== id), readings, provenance, actions })
}

// ----------------------------------------------------------------- readings

function validSubject(ws: Workspace, subject: string): boolean {
  return subject === ENV_SUBJECT || ws.crew.some((c) => c.id === subject)
}

function scopeMatches(ind: WorkspaceIndicator, subject: string): boolean {
  return ind.scope === 'environment' ? subject === ENV_SUBJECT : subject !== ENV_SUBJECT
}

/** Set or (with null) clear one reading. Invalid subjects, indicators or days are ignored. */
export function setReading(ws: Workspace, subject: string, indicatorId: string, day: number, value: number | null, provenance: Provenance = 'user-entered'): Workspace {
  if (value === null) {
    const series = ws.readings[subject]?.[indicatorId]
    if (!series || !(day in series)) return ws
    const { [day]: _gone, ...rest } = series
    void _gone
    return touch({ ...ws, readings: { ...ws.readings, [subject]: { ...ws.readings[subject], [indicatorId]: rest } } })
  }
  return setReadings(ws, [{ subject, indicatorId, day, value }], provenance)
}

/** Apply many readings at once. Returns the workspace unchanged if none were valid. */
export function setReadings(ws: Workspace, rows: readonly ReadingRow[], provenance: Provenance = 'user-entered'): Workspace {
  const readings = { ...ws.readings }
  const prov = { ...ws.provenance }
  const copied = new Set<string>()
  let maxDay = ws.mission.currentDay
  let applied = 0
  for (const row of rows) {
    const ind = ws.indicators.find((i) => i.id === row.indicatorId)
    if (!ind || !validSubject(ws, row.subject) || !scopeMatches(ind, row.subject)) continue
    if (!Number.isFinite(row.value) || !Number.isInteger(row.day) || row.day < 1 || row.day > MAX_MISSION_DAYS) continue
    if (!copied.has(row.subject)) {
      readings[row.subject] = { ...(readings[row.subject] ?? {}) }
      prov[row.subject] = { ...(prov[row.subject] ?? {}) }
      copied.add(row.subject)
    }
    const key = `${row.subject}|${row.indicatorId}`
    if (!copied.has(key)) {
      readings[row.subject][row.indicatorId] = { ...(readings[row.subject][row.indicatorId] ?? {}) }
      copied.add(key)
    }
    readings[row.subject][row.indicatorId][row.day] = row.value
    // A series keeps its first label unless the user later types into an imported or synthetic one.
    const existing = prov[row.subject][row.indicatorId]
    prov[row.subject][row.indicatorId] = !existing || provenance === 'user-entered' ? provenance : existing
    if (row.day > maxDay) maxDay = row.day
    applied++
  }
  if (!applied) return ws
  const mission = maxDay > ws.mission.currentDay ? { ...ws.mission, currentDay: maxDay, totalDays: Math.max(ws.mission.totalDays, maxDay) } : ws.mission
  return touch({ ...ws, readings, provenance: prov, mission })
}

export function countReadings(ws: Workspace, subject?: string): number {
  let n = 0
  for (const s of Object.keys(ws.readings)) {
    if (subject && s !== subject) continue
    for (const id of Object.keys(ws.readings[s])) n += Object.keys(ws.readings[s][id]).length
  }
  return n
}

// --------------------------------------------------------------- indicators

export interface CustomIndicatorInput {
  label: string
  unit: string
  scope: 'crew' | 'environment'
  category?: string
  decimals?: number
  cadenceDays?: number
  min?: number
  max?: number
}

export function addIndicator(ws: Workspace, input: CustomIndicatorInput): Workspace {
  const label = input.label.trim().slice(0, 60)
  if (!label) return ws
  const lo = Number.isFinite(input.min) ? (input.min as number) : -1e6
  const hi = Number.isFinite(input.max) ? (input.max as number) : 1e6
  const decimals = clampInt(input.decimals ?? 1, 0, 3)
  const indicator: WorkspaceIndicator = {
    id: uniqueId(slug(label), ws.indicators.map((i) => i.id)),
    label,
    shortLabel: label.length > 14 ? `${label.slice(0, 13)}…` : label,
    unit: input.unit.trim().slice(0, 16),
    category: input.scope === 'environment' ? 'environment' : (input.category ?? 'custom'),
    decimals,
    cadenceDays: clampInt(input.cadenceDays ?? 1, 1, 30),
    collection: 'Defined by the user.',
    plausibleRange: lo < hi ? [lo, hi] : [hi, lo],
    resolution: Math.pow(10, -decimals),
    scope: input.scope,
    builtin: false,
    enabled: true,
  }
  return touch({ ...ws, indicators: [...ws.indicators, indicator] })
}

export function setIndicatorEnabled(ws: Workspace, id: string, enabled: boolean): Workspace {
  if (!ws.indicators.some((i) => i.id === id)) return ws
  return touch({ ...ws, indicators: ws.indicators.map((i) => (i.id === id ? { ...i, enabled } : i)) })
}

/** Only user-defined indicators can be removed; their readings go with them. */
export function removeIndicator(ws: Workspace, id: string): Workspace {
  const ind = ws.indicators.find((i) => i.id === id)
  if (!ind || ind.builtin) return ws
  const readings: Workspace['readings'] = {}
  for (const s of Object.keys(ws.readings)) {
    const { [id]: _gone, ...rest } = ws.readings[s]
    void _gone
    readings[s] = rest
  }
  return touch({ ...ws, indicators: ws.indicators.filter((i) => i.id !== id), readings })
}

// ------------------------------------------------------- phases and events

export function addPhase(ws: Workspace, input: Omit<MissionPhase, 'id'>): Workspace {
  const name = input.name.trim().slice(0, 60)
  if (!name) return ws
  const startDay = clampInt(input.startDay, 1, MAX_MISSION_DAYS)
  const endDay = clampInt(Math.max(input.endDay, startDay), startDay, MAX_MISSION_DAYS)
  const gravity = Math.min(3, Math.max(0, Number.isFinite(input.gravity) ? input.gravity : 0))
  const phase: MissionPhase = { id: `ph-${Date.now().toString(36)}-${ws.phases.length}`, name, startDay, endDay, gravity }
  return touch({ ...ws, phases: [...ws.phases, phase].sort((a, b) => a.startDay - b.startDay) })
}

export function removePhase(ws: Workspace, id: string): Workspace {
  return touch({ ...ws, phases: ws.phases.filter((p) => p.id !== id) })
}

export function addEvent(ws: Workspace, input: Omit<MissionEventRecord, 'id'>): Workspace {
  const title = input.title.trim().slice(0, 80)
  if (!title) return ws
  const day = clampInt(input.day, 1, MAX_MISSION_DAYS)
  const endDay = input.endDay !== undefined && input.endDay > day ? clampInt(input.endDay, day, MAX_MISSION_DAYS) : undefined
  const event: MissionEventRecord = { id: `ev-${Date.now().toString(36)}-${ws.events.length}`, day, endDay, title, description: input.description.trim().slice(0, 240), kind: input.kind }
  return touch({ ...ws, events: [...ws.events, event].sort((a, b) => a.day - b.day) })
}

export function removeEvent(ws: Workspace, id: string): Workspace {
  return touch({ ...ws, events: ws.events.filter((e) => e.id !== id) })
}

// ------------------------------------------------------------------ actions

export function addAction(ws: Workspace, crewId: string, action: RecordedAction): Workspace {
  if (!ws.crew.some((c) => c.id === crewId)) return ws
  return touch({ ...ws, actions: { ...ws.actions, [crewId]: [...(ws.actions[crewId] ?? []), action] } })
}

export function removeAction(ws: Workspace, crewId: string, actionId: string): Workspace {
  return touch({ ...ws, actions: { ...ws.actions, [crewId]: (ws.actions[crewId] ?? []).filter((a) => a.id !== actionId) } })
}

// ------------------------------------------------------------- persistence

/** Validate and repair a workspace loaded from storage or a file. Returns null if it is not one. */
export function parseWorkspace(input: unknown): Workspace | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<Workspace>
  if (raw.version !== 1 || !raw.mission || !Array.isArray(raw.crew) || !Array.isArray(raw.indicators)) return null
  const base = emptyWorkspace()
  // Built-in indicators always exist, so a file from an older catalogue still loads.
  const byId = new Map(raw.indicators.filter((i) => i && typeof i.id === 'string').map((i) => [i.id, i]))
  const indicators: WorkspaceIndicator[] = base.indicators.map((d) => ({ ...d, enabled: byId.get(d.id)?.enabled ?? d.enabled }))
  for (const i of raw.indicators) {
    if (i && typeof i.id === 'string' && !i.builtin && !indicators.some((x) => x.id === i.id) && typeof i.label === 'string') indicators.push({ ...i, builtin: false })
  }
  const crew = raw.crew.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string').map((c, k) => ({ id: c.id, name: c.name, role: c.role ?? 'Crew member', color: c.color ?? CREW_COLORS[k % CREW_COLORS.length] }))
  const subjects = new Set([ENV_SUBJECT, ...crew.map((c) => c.id)])
  const readings: Workspace['readings'] = {}
  for (const [s, bySeries] of Object.entries(raw.readings ?? {})) {
    if (!subjects.has(s) || !bySeries || typeof bySeries !== 'object') continue
    readings[s] = {}
    for (const [id, series] of Object.entries(bySeries)) {
      if (!indicators.some((i) => i.id === id) || !series || typeof series !== 'object') continue
      const clean: Record<number, number> = {}
      for (const [d, v] of Object.entries(series)) {
        const day = Number(d)
        if (Number.isInteger(day) && day >= 1 && day <= MAX_MISSION_DAYS && typeof v === 'number' && Number.isFinite(v)) clean[day] = v
      }
      readings[s][id] = clean
    }
  }
  const ws: Workspace = {
    version: 1,
    mission: base.mission,
    crew,
    indicators,
    readings,
    provenance: (raw.provenance as Workspace['provenance']) ?? {},
    phases: Array.isArray(raw.phases) ? raw.phases.filter((p) => p && typeof p.name === 'string') : [],
    events: Array.isArray(raw.events) ? raw.events.filter((e) => e && typeof e.title === 'string' && typeof e.day === 'number') : [],
    actions: raw.actions && typeof raw.actions === 'object' ? (raw.actions as Workspace['actions']) : {},
    baseline: raw.baseline === 'reference' || raw.baseline === 'rolling' ? raw.baseline : 'auto',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  }
  return { ...setMission(ws, { ...base.mission, ...raw.mission }), updatedAt: ws.updatedAt }
}
