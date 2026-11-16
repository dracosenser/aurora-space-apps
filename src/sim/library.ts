import { useSyncExternalStore } from 'react'
import { defaultParams } from './events'
import { NOMINAL_ENVIRONMENT } from './reference'
import type { AstronautProfile, Environment, EventType, MissionConfig, MissionEvent } from './types'

/**
 * Mission library: create, save, load, duplicate and delete missions.
 * Stored in this browser's localStorage (the project's existing approach).
 * Results are not stored: the engine is deterministic, so a saved mission
 * reproduces exactly the same results whenever it is run.
 */

const KEY = 'aurora.missions.v1'
export const CREW_COLORS = ['#7aa7ff', '#ff9153', '#4fd6c0', '#c7a2ff', '#ffb84d', '#ff7a85', '#aacf63', '#6fd3e8', '#f075a4', '#d9c27a']

let counter = 0
export function newId(prefix: string): string {
  counter = (counter + 1) % 1e6
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

export function newAstronaut(index: number, patch: Partial<AstronautProfile> = {}): AstronautProfile {
  return {
    id: newId('AST'),
    name: `Astronaut ${index + 1}`,
    callsign: '',
    role: 'Flight Engineer',
    description: '',
    responsibilities: '',
    color: CREW_COLORS[index % CREW_COLORS.length],
    participates: true,
    schedule: { sleepStartHour: 22, sleepHours: 8.5, workHours: 9, exerciseSessionsPerWeek: 6, exerciseMinutes: 75, exerciseHour: 16, workload: 3 },
    baseline: { restingHR: 60, hrv: 60, respRate: 14, spo2: 98, bodyTemp: 36.7, sleepNeed: 7.5, sleepRequirement: 8, activityMinutes: 140, variability: 1, systolicBP: 118, diastolicBP: 76 },
    ...patch,
  }
}

export function duplicateAstronaut(a: AstronautProfile, index: number): AstronautProfile {
  return { ...structuredClone(a), id: newId('AST'), name: `${a.name} (copy)`, color: CREW_COLORS[index % CREW_COLORS.length] }
}

export function newEvent(type: EventType, startDay: number, durationDays: number, title: string, patch: Partial<MissionEvent> = {}): MissionEvent {
  return { id: newId('EV'), type, title, startDay, durationDays, crewWide: true, astronautIds: [], params: defaultParams(type), notes: '', ...patch }
}

export function blankMission(): MissionConfig {
  return {
    id: newId('MSN'),
    name: 'New mission',
    missionCode: 'AUR-01',
    destination: 'Low Earth orbit',
    description: '',
    startDate: new Date().toISOString().slice(0, 10),
    durationDays: 90,
    resolution: 'daily',
    seed: Math.floor(Math.random() * 1e6),
    spacecraft: { name: 'Spacecraft', habitableVolumeM3: 100, exerciseEquipment: 'Treadmill, cycle ergometer, resistive device' },
    environment: { ...NOMINAL_ENVIRONMENT },
    crew: [newAstronaut(0, { name: 'Commander', role: 'Commander' }), newAstronaut(1)],
    events: [],
    scenarioOf: null,
    updatedAt: Date.now(),
  }
}

/** A copy that keeps the seed and every astronaut and event id, so the two runs are directly comparable. */
export function scenarioCopy(m: MissionConfig, name?: string): MissionConfig {
  return { ...structuredClone(m), id: newId('MSN'), name: name ?? `${m.name} — scenario B`, scenarioOf: m.id, updatedAt: Date.now() }
}

/** An independent copy with fresh ids. */
export function duplicateMission(m: MissionConfig): MissionConfig {
  const copy = structuredClone(m)
  const idMap = new Map(copy.crew.map((c) => [c.id, newId('AST')]))
  copy.crew = copy.crew.map((c) => ({ ...c, id: idMap.get(c.id)! }))
  copy.events = copy.events.map((e) => ({ ...e, id: newId('EV'), astronautIds: e.astronautIds.map((id) => idMap.get(id) ?? id) }))
  return { ...copy, id: newId('MSN'), name: `${m.name} (copy)`, scenarioOf: null, updatedAt: Date.now() }
}

// ----------------------------------------------------------------- examples

function env(patch: Partial<Environment>): Environment {
  return { ...NOMINAL_ENVIRONMENT, ...patch }
}

export function exampleMissions(): MissionConfig[] {
  const mars = blankMission()
  const crew = [
    newAstronaut(0, { name: 'Maren Holt', callsign: 'Holt', role: 'Commander', responsibilities: 'Operations, EVA planning', baseline: { restingHR: 56, hrv: 62, respRate: 13, spo2: 98, bodyTemp: 36.6, sleepNeed: 7.2, activityMinutes: 150, variability: 1 } }),
    newAstronaut(1, { name: 'Kenji Arakawa', callsign: 'Arakawa', role: 'Flight Engineer', responsibilities: 'Life support, exercise hardware', schedule: { sleepStartHour: 22, sleepHours: 8.5, workHours: 10, exerciseSessionsPerWeek: 6, exerciseMinutes: 75, exerciseHour: 7, workload: 3.5 }, baseline: { restingHR: 60, hrv: 55, respRate: 14, spo2: 98, bodyTemp: 36.7, sleepNeed: 7, activityMinutes: 160, variability: 1.1 } }),
    newAstronaut(2, { name: 'Amara Diallo', callsign: 'Diallo', role: 'Flight Surgeon', responsibilities: 'Crew medical', baseline: { restingHR: 58, hrv: 68, respRate: 13, spo2: 98, bodyTemp: 36.7, sleepNeed: 7.1, activityMinutes: 130, variability: 0.9 } }),
    newAstronaut(3, { name: 'Luca Ferreira', callsign: 'Ferreira', role: 'Science Officer', responsibilities: 'Geology, rover traverses', baseline: { restingHR: 54, hrv: 74, respRate: 12, spo2: 98, bodyTemp: 36.5, sleepNeed: 7.3, activityMinutes: 155, variability: 1 } }),
  ]
  const [holt, arakawa, , ferreira] = crew
  Object.assign(mars, {
    name: 'Example: 150-day Mars transit',
    missionCode: 'ARES-T150',
    destination: 'Earth–Mars transit',
    description: 'A synthetic example mission. Four crew in microgravity with a solar particle event, a treadmill failure and a CO₂ scrubber fault. Every value it produces is simulated.',
    durationDays: 150,
    seed: 20261115,
    spacecraft: { name: 'Ares Transit Vehicle', habitableVolumeM3: 140, exerciseEquipment: 'Treadmill, cycle ergometer, resistive device' },
    environment: env({ radiationMSvPerDay: 1.8, gravityG: 0, co2mmHg: 2.6, noiseDBA: 52 }),
    crew,
    events: [
      newEvent('solar-particle-event', 41, 2, 'Solar particle event: shelter', { params: { doseMSv: 22, sleepLossHours: 3, stressIncrease: 1.5 } }),
      newEvent('exercise-unavailable', 60, 18, 'Treadmill drive fault', { params: { availabilityPct: 25 } }),
      newEvent('environment-anomaly', 88, 9, 'CO₂ scrubber bed offline', { envOverride: { co2mmHg: 5.5 }, notes: 'One scrubber bed down for maintenance.' }),
      newEvent('sleep-disruption', 89, 8, 'Night repair shifts', { crewWide: false, astronautIds: [arakawa.id], params: { sleepLossHours: 2.5 } }),
      newEvent('comms-outage', 110, 14, 'Solar conjunction blackout', { params: { stressIncrease: 1.5 } }),
      newEvent('workload', 112, 12, 'Science campaign surge', { crewWide: false, astronautIds: [ferreira.id, holt.id], params: { workloadIncrease: 1.5, sleepLossHours: 0.75 } }),
      newEvent('recovery', 130, 7, 'Recovery week', { params: { workloadReduction: 1, extraSleepHours: 1 } }),
    ],
  })

  const orbit = blankMission()
  Object.assign(orbit, {
    name: 'Example: 30-day orbital research',
    missionCode: 'LEO-30',
    destination: 'Low Earth orbit',
    description: 'A short synthetic orbital mission at hourly resolution with one EVA.',
    durationDays: 30,
    resolution: 'hourly',
    seed: 3030,
    environment: env({ radiationMSvPerDay: 0.5 }),
  })
  orbit.events = [newEvent('eva', 14, 1, 'EVA-1', { crewWide: false, astronautIds: [orbit.crew[0].id] })]

  const lunar = blankMission()
  Object.assign(lunar, {
    name: 'Example: 90-day lunar surface stay',
    missionCode: 'ART-S90',
    destination: 'Lunar south pole',
    description: 'A synthetic lunar surface mission at one-sixth gravity with a reduced-pressure, oxygen-enriched cabin (about 30 % O₂ at 70 kPa).',
    durationDays: 90,
    seed: 9090,
    environment: env({ gravityG: 0.165, pressureKPa: 70.3, ppO2KPa: 21.1, radiationMSvPerDay: 1.2 }),
  })
  lunar.crew.push(newAstronaut(2, { name: 'Surface Specialist', role: 'Geologist' }), newAstronaut(3, { name: 'Pilot', role: 'Pilot' }))
  lunar.events = [newEvent('lighting-change', 30, 10, 'Lunar night operations', { params: { shiftHours: 4 } }), newEvent('eva', 20, 3, 'Surface EVA block', { params: { hours: 7, doseMultiplier: 2, sleepLossHours: 1 } })]

  return [mars, orbit, lunar]
}

// ------------------------------------------------------------------ storage

interface LibraryState {
  missions: MissionConfig[]
  activeId: string | null
}

function load(): LibraryState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LibraryState
      if (Array.isArray(parsed.missions)) return { missions: parsed.missions.filter(isMission), activeId: parsed.activeId ?? null }
    }
  } catch {
    /* fall through to examples */
  }
  const missions = exampleMissions()
  return { missions, activeId: missions[0].id }
}

export function isMission(m: unknown): m is MissionConfig {
  const x = m as MissionConfig
  return !!x && typeof x.id === 'string' && typeof x.durationDays === 'number' && Array.isArray(x.crew) && Array.isArray(x.events) && !!x.environment
}

let state: LibraryState | null = null
const listeners = new Set<() => void>()
const get = () => (state ??= load())
function set(next: LibraryState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full: keep in memory */
  }
  for (const l of listeners) l()
}

export const missionLibrary = {
  get,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  active(): MissionConfig | null {
    const s = get()
    return s.missions.find((m) => m.id === s.activeId) ?? s.missions[0] ?? null
  },
  setActive(id: string) {
    set({ ...get(), activeId: id })
  },
  save(m: MissionConfig) {
    const s = get()
    const next = { ...m, updatedAt: Date.now() }
    const exists = s.missions.some((x) => x.id === m.id)
    set({ missions: exists ? s.missions.map((x) => (x.id === m.id ? next : x)) : [...s.missions, next], activeId: s.activeId ?? m.id })
  },
  add(m: MissionConfig, activate = true) {
    const s = get()
    set({ missions: [...s.missions, m], activeId: activate ? m.id : s.activeId })
  },
  remove(id: string) {
    const s = get()
    const missions = s.missions.filter((m) => m.id !== id)
    set({ missions, activeId: s.activeId === id ? (missions[0]?.id ?? null) : s.activeId })
  },
  restoreExamples() {
    const s = get()
    const ex = exampleMissions()
    set({ missions: [...s.missions, ...ex], activeId: ex[0].id })
  },
}

export function useMissionLibrary(): LibraryState {
  return useSyncExternalStore(missionLibrary.subscribe, get, get)
}
