import { useMemo } from 'react'
import type { MissionAnalysis } from '../engine/analysis'
import { alertsFor, analyzeAstronaut, type SimAlert } from './analyze'
import { fingerprint, participants, simulate, validateConfig } from './engine'
import { missionLibrary, useMissionLibrary } from './library'
import type { MissionConfig, SimulationResult } from './types'

/**
 * Shared run cache. Every interface (results, comparison, medical monitor,
 * spacecraft consoles) asks here, so one mission is simulated once and every
 * view shows the same numbers.
 */

const results = new Map<string, SimulationResult>()
const analyses = new Map<string, MissionAnalysis>()
const MAX_RUNS = 8

export function runMission(config: MissionConfig): { result: SimulationResult | null; error: string | null } {
  const key = fingerprint(config)
  const hit = results.get(key)
  if (hit) return { result: hit, error: null }
  if (validateConfig(config).some((i) => i.level === 'error')) return { result: null, error: validateConfig(config).filter((i) => i.level === 'error').map((i) => i.message).join(' ') }
  try {
    const r = simulate(config)
    results.set(key, r)
    if (results.size > MAX_RUNS) {
      const oldest = results.keys().next().value as string
      results.delete(oldest)
      for (const k of analyses.keys()) if (k.startsWith(`${oldest}|`)) analyses.delete(k)
    }
    return { result: r, error: null }
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export function analysisFor(config: MissionConfig, result: SimulationResult, astronautId: string): MissionAnalysis {
  const key = `${result.fingerprint}|${astronautId}`
  let a = analyses.get(key)
  if (!a) {
    a = analyzeAstronaut(config, result, astronautId)
    analyses.set(key, a)
  }
  return a
}

export function crewAlerts(config: MissionConfig, result: SimulationResult, asOfDay = result.days): SimAlert[] {
  return participants(config).flatMap((a) => alertsFor(config, result, analysisFor(config, result, a.id), a.id, asOfDay))
}

export function useMissionRun(config: MissionConfig | null) {
  const key = config ? fingerprint(config) : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (config ? runMission(config) : { result: null, error: 'No mission selected.' }), [key])
}

// -------------------------------------------------- spacecraft integration

/**
 * The integration contract for the spacecraft consoles. Everything a console
 * needs about the active mission, derived from the simulation (the source of
 * truth). Plain data, no React, so any renderer can consume it.
 */
export interface SpacecraftFeed {
  mission: { id: string; name: string; code: string; destination: string; durationDays: number; day: number; progress: number; startDate: string }
  environment: { key: string; value: number }[]
  crew: { id: string; name: string; role: string; current: Record<string, number>; alerts: number }[]
  alerts: { astronautId: string; level: string; title: string; startDay: number; active: boolean }[]
  events: { title: string; startDay: number; endDay: number; active: boolean }[]
}

export function spacecraftFeed(day?: number): SpacecraftFeed | null {
  const config = missionLibrary.active()
  if (!config) return null
  const { result } = runMission(config)
  if (!result) return null
  const d = Math.min(result.days, Math.max(1, Math.round(day ?? result.days)))
  const alerts = crewAlerts(config, result, d)
  return {
    mission: { id: config.id, name: config.name, code: config.missionCode, destination: config.destination, durationDays: config.durationDays, day: d, progress: d / config.durationDays, startDate: config.startDate },
    environment: Object.entries(result.environment).map(([key, arr]) => ({ key, value: arr[d - 1] })),
    crew: result.astronauts.map((r) => {
      const p = config.crew.find((c) => c.id === r.astronautId)!
      return { id: p.id, name: p.name, role: p.role, current: Object.fromEntries(Object.entries(r.daily).map(([k, arr]) => [k, arr[d - 1]])), alerts: alerts.filter((a) => a.astronautId === p.id && a.active).length }
    }),
    alerts: alerts.map((a) => ({ astronautId: a.astronautId, level: a.level, title: a.explanation.split('.')[0], startDay: a.startDay, active: a.active })),
    events: config.events.map((e) => ({ title: e.title, startDay: e.startDay, endDay: e.startDay + e.durationDays - 1, active: d >= e.startDay && d < e.startDay + e.durationDays })),
  }
}

/** React hook for the active mission, its run, and a function to analyse any astronaut. */
export function useActiveSimulation() {
  const lib = useMissionLibrary()
  const config = lib.missions.find((m) => m.id === lib.activeId) ?? lib.missions[0] ?? null
  const run = useMissionRun(config)
  return { config, ...run }
}
