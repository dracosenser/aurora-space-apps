import { useSyncExternalStore } from 'react'
import { ASTRONAUTS } from '../data/astronauts'
import { EVENTS, MISSION, PHASES } from '../data/mission'
import type { DailyRecord, MissionEvent as AppEvent } from '../types'
import { participants } from './engine'
import { exampleMissions, missionLibrary } from './library'
import { ENV_PARAMS } from './reference'
import { runMission } from './runtime'
import type { EnvKey, EventType, MissionConfig, SimulationResult } from './types'

/**
 * Launching a mission makes it the source of truth for the whole application.
 *
 * The rest of AURORA (Mission Control, Crew Health, Early Warning, Signal Veil,
 * the Assistant, the Flight Deck, reports) reads its crew, mission and events
 * from the shared objects in src/data. Launching replaces their contents with
 * the built mission and derives every daily record from the simulation, so no
 * page shows the old fixed demonstration any more.
 */

const KEY = 'aurora.launched.v1'

function loadLaunched(): MissionConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as MissionConfig) : null
  } catch {
    return null
  }
}

let launched: MissionConfig | null = null
const listeners = new Set<() => void>()

function getLaunched(): MissionConfig {
  if (!launched) launched = loadLaunched() ?? missionLibrary.active() ?? exampleMissions()[0]
  return launched
}

export const launchControl = {
  get: getLaunched,
  /** Launch a mission: every page switches to it. */
  launch(config: MissionConfig) {
    launched = structuredClone(config)
    try {
      localStorage.setItem(KEY, JSON.stringify(launched))
    } catch {
      /* keep in memory */
    }
    for (const l of listeners) l()
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useLaunchedMission(): MissionConfig {
  return useSyncExternalStore(launchControl.subscribe, getLaunched, getLaunched)
}

/** The launched mission and its simulation (falls back to the first example if the launched one cannot run). */
export function launchedRun(): { config: MissionConfig; result: SimulationResult; fallback: string | null } {
  const config = getLaunched()
  const run = runMission(config)
  if (run.result) return { config, result: run.result, fallback: null }
  const ex = exampleMissions()[0]
  return { config: ex, result: runMission(ex).result!, fallback: run.error }
}

/** Cabin conditions in effect on a day of the launched mission. */
export function launchedEnvironmentOn(day: number): Record<EnvKey, number> {
  const { result } = launchedRun()
  const d = Math.min(result.days, Math.max(1, Math.round(day)))
  return Object.fromEntries(ENV_PARAMS.map((p) => [p.key, result.environment[p.key][d - 1]])) as Record<EnvKey, number>
}

const EVENT_KIND: Record<EventType, { type: AppEvent['type']; severity: AppEvent['severity'] }> = {
  workload: { type: 'operations', severity: 'watch' },
  'sleep-disruption': { type: 'operations', severity: 'watch' },
  'exercise-unavailable': { type: 'systems', severity: 'watch' },
  'exercise-change': { type: 'operations', severity: 'info' },
  'comms-outage': { type: 'communications', severity: 'watch' },
  'solar-particle-event': { type: 'radiation', severity: 'caution' },
  eva: { type: 'operations', severity: 'info' },
  recovery: { type: 'medical', severity: 'info' },
  'environment-anomaly': { type: 'systems', severity: 'caution' },
  'lighting-change': { type: 'environment', severity: 'watch' },
  'noise-change': { type: 'environment', severity: 'watch' },
  stress: { type: 'operations', severity: 'watch' },
  custom: { type: 'operations', severity: 'info' },
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

/**
 * Replace the application's mission, crew, phases and events with the
 * launched mission, and return the daily records derived from its simulation.
 * Mutates the shared objects in place so every existing import sees the change.
 */
export function applyLaunch(config: MissionConfig, result: SimulationResult): DailyRecord[] {
  const crew = participants(config).filter((c) => result.astronauts.some((r) => r.astronautId === c.id))

  ASTRONAUTS.splice(
    0,
    ASTRONAUTS.length,
    ...crew.map((c) => ({
      id: c.id,
      name: c.name,
      callsign: c.callsign || (/^\D+$/.test(c.name.split(/\s+/).slice(-1)[0] ?? '') && c.name.includes(' ') ? c.name.split(/\s+/).slice(-1)[0] : c.name),
      role: c.role,
      background: [c.responsibilities, c.description].filter(Boolean).join('. ') || `${c.role} on ${config.name}.`,
      color: c.color,
      initials: initials(c.name),
      baseline: {
        restingHR: c.baseline.restingHR,
        hrv: c.baseline.hrv,
        systolicBP: c.baseline.systolicBP ?? 118,
        diastolicBP: c.baseline.diastolicBP ?? 76,
        sleepDuration: c.baseline.sleepNeed,
        exerciseMinutes: (c.schedule.exerciseSessionsPerWeek * c.schedule.exerciseMinutes) / 7,
      },
    })),
  )

  const g = config.environment.gravityG
  const where = config.destination || 'Mission'
  PHASES.splice(0, PHASES.length, { id: 'mission', name: where, startDay: 1, endDay: config.durationDays, gravity: g, description: `${config.spacecraft.name}, ${g === 0 ? 'microgravity' : `${g} g`}.` })

  Object.assign(MISSION, {
    name: config.name,
    designation: `${config.missionCode} · ${config.spacecraft.name}`,
    description: config.description || `A ${config.durationDays}-day mission built in the Mission Builder. All crew data is simulated.`,
    launchDate: config.startDate,
    totalDays: config.durationDays,
    currentDay: config.durationDays,
    destination: where,
    phases: PHASES,
  })

  EVENTS.splice(
    0,
    EVENTS.length,
    { id: 'launch', day: 1, title: 'Mission start', type: 'milestone', description: `${config.name} begins.`, severity: 'info' },
    ...[...config.events]
      .filter((e) => e.startDay <= config.durationDays)
      .sort((a, b) => a.startDay - b.startDay)
      .map((e) => ({
        id: e.id,
        day: e.startDay,
        endDay: e.durationDays > 1 ? Math.min(config.durationDays, e.startDay + e.durationDays - 1) : undefined,
        title: e.title,
        type: EVENT_KIND[e.type].type,
        description: [e.notes, e.crewWide ? 'Whole crew.' : `Affects ${e.astronautIds.map((id) => config.crew.find((c) => c.id === id)?.name ?? id).join(', ')}.`].filter(Boolean).join(' '),
        severity: EVENT_KIND[e.type].severity,
      })),
    { id: 'end', day: config.durationDays, title: 'Mission end', type: 'milestone', description: `End of the ${config.durationDays}-day profile.`, severity: 'info' },
  )

  const records: DailyRecord[] = []
  for (const run of result.astronauts) {
    let cumulative = 0
    const d = run.daily
    for (let i = 0; i < result.days; i++) {
      cumulative += d.radiationDose[i]
      records.push({
        day: i + 1,
        astronautId: run.astronautId,
        restingHR: Math.round(d.restingHR[i]),
        hrv: Math.round(d.hrv[i]),
        systolicBP: Math.round(d.systolicBP[i]),
        diastolicBP: Math.round(d.diastolicBP[i]),
        sleepDuration: Math.round(d.sleepDuration[i] * 10) / 10,
        sleepConsistency: Math.round(d.sleepConsistency[i]),
        sleepQuality: Math.round(d.sleepQuality[i]),
        exerciseMinutes: Math.round(d.exerciseMinutes[i]),
        muscleStrength: Math.round(d.muscleStrength[i] * 10) / 10,
        boneDensity: Math.round(d.boneDensity[i] * 100) / 100,
        radiationDaily: Math.round(d.radiationDose[i] * 1000) / 1000,
        radiationCumulative: Math.round(cumulative * 100) / 100,
        stress: Math.round(d.stress[i] * 10) / 10,
        mood: Math.round(d.mood[i] * 10) / 10,
        fatigue: Math.round(d.fatigue[i] * 10) / 10,
      })
    }
  }
  return records
}

/** Lowest mission day the day controls allow (short missions start at day 1). */
export function minViewDay(): number {
  return Math.min(45, Math.max(1, Math.floor(MISSION.totalDays / 3)))
}
