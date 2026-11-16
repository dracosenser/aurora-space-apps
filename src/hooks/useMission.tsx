import { createContext, useCallback, useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Alert, AssistantMessage, DailyRecord, PageId, ScenarioParams } from '../types'
import { ASTRONAUTS } from '../data/astronauts'
import { EVENTS, MISSION } from '../data/mission'
import { launchedRun, minViewDay } from '../sim/launch'
import { assess } from '../sim/assess'
import { detectAnomalies } from '../lib/anomaly'
import { computeStatus, crewScore, withAssessment, type AstronautStatus } from '../lib/health'
import { EMPTY_LOG, batteryComplete, newlyEarned, pointsForReading, type CrewLog, pointsForVeilStep } from '../lib/gamify'
import type { CheckId } from '../data/selfcheck'

/**
 * Lightweight local data layer. Synthetic records are generated once from a
 * fixed seed; user state (view day, theme, selections, chat) persists to
 * localStorage and can be reset with "Reset demo".
 */

const LS_KEY = 'aurora.state.v1'

interface PersistedState {
  /** Which launched mission this state belongs to. */
  missionKey: string
  viewDay: number
  theme: 'dark' | 'light'
  selectedAstronautId: string
  lastScenario: ScenarioParams | null
  chat: AssistantMessage[]
  tourSeen: boolean
  /** The crew member's own self-assessment log and protocol board. */
  log: CrewLog
}

// The launched mission is applied before this provider mounts, so these read its values.
function defaultState(missionKey: string): PersistedState {
  return {
    missionKey,
    viewDay: MISSION.currentDay,
    theme: 'dark',
    selectedAstronautId: ASTRONAUTS[0]?.id ?? '',
    lastScenario: null,
    chat: [],
    tourSeen: false,
    log: EMPTY_LOG,
  }
}

function loadState(missionKey: string): PersistedState {
  const base = defaultState(missionKey)
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    // A different mission was launched: keep preferences, reset mission-specific state.
    const same = parsed.missionKey === missionKey
    return {
      ...base,
      theme: parsed.theme ?? base.theme,
      tourSeen: parsed.tourSeen ?? base.tourSeen,
      lastScenario: parsed.lastScenario ?? null,
      log: { ...EMPTY_LOG, ...(parsed.log ?? {}) },
      chat: same ? (parsed.chat ?? []) : [],
      selectedAstronautId: same && ASTRONAUTS.some((a) => a.id === parsed.selectedAstronautId) ? parsed.selectedAstronautId! : base.selectedAstronautId,
      viewDay: same ? Math.min(MISSION.currentDay, Math.max(minViewDay(), parsed.viewDay ?? MISSION.currentDay)) : MISSION.currentDay,
    }
  } catch {
    return base
  }
}

export interface MissionState extends PersistedState {
  page: PageId
  setPage: (p: PageId) => void
  records: DailyRecord[]
  visibleRecords: DailyRecord[]
  alerts: Alert[]
  statuses: AstronautStatus[]
  crew: number
  setViewDay: (d: number) => void
  setTheme: (t: 'dark' | 'light') => void
  setSelectedAstronautId: (id: string) => void
  setLastScenario: (p: ScenarioParams | null) => void
  setChat: (fn: (prev: AssistantMessage[]) => AssistantMessage[]) => void
  setTourSeen: (v: boolean) => void
  /** Record a self-taken reading for the current mission day. */
  logReading: (id: CheckId, value: number) => void
  /** Mark a protocol cleared for the current mission day. */
  clearProtocol: (id: string) => void
  /** Bank SIGNAL VEIL steps onto the shared score and patch board. */
  recordVeilProgress: (steps: string[]) => void
  /** Open a fresh duty period, restarting the countdown. */
  openPeriod: () => void
  resetDemo: () => void
  isLive: boolean
}

const MissionContext = createContext<MissionState | null>(null)

function pageFromHash(): PageId {
  const h = (window.location.hash || '').replace('#/', '').replace('#', '') as PageId
  const valid: PageId[] = ['mission-control', 'crew-health', 'early-warning', 'self-check', 'signal-veil', 'flight-deck', 'workbench', 'missions', 'medical', 'simulator', 'assistant', 'sources', 'presentation']
  // Everything starts from the mission you build.
  return valid.includes(h) ? h : 'missions'
}

/**
 * App-wide mission state. `records` are the daily records of the launched
 * mission's simulation; the provider is remounted whenever a mission is launched.
 */
export function MissionProvider({ children, records, missionKey }: { children: ReactNode; records: DailyRecord[]; missionKey: string }) {
  const [state, setState] = useState<PersistedState>(() => loadState(missionKey))
  const [page, setPageState] = useState<PageId>(pageFromHash)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable: run in-memory */
    }
  }, [state])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  useEffect(() => {
    const onHash = () => setPageState(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const setPage = useCallback((p: PageId) => {
    window.location.hash = `/${p}`
    setPageState(p)
    window.scrollTo({ top: 0 })
  }, [])

  // Detection over the whole crew costs tens of milliseconds per mission day. Results are
  // cached per day, and the derived data follows a deferred copy of the day so the slider
  // and playback stay responsive while the work catches up.
  const alertCache = useMemo(() => new Map<number, Alert[]>(), [records])
  const day = useDeferredValue(state.viewDay)
  const visibleRecords = useMemo(() => records.filter((r) => r.day <= day), [records, day])
  const alerts = useMemo(() => {
    let a = alertCache.get(day)
    if (!a) {
      a = detectAnomalies(records, ASTRONAUTS, day)
      alertCache.set(day, a)
    }
    return a
  }, [records, day, alertCache])
  const statuses = useMemo(() => {
    const { config, result } = launchedRun()
    return ASTRONAUTS.map((a) => withAssessment(computeStatus(a, records, alerts, day), assess(config, result, a.id, day)))
  }, [records, alerts, day])
  const crew = useMemo(() => crewScore(statuses), [statuses])

  const value: MissionState = {
    ...state,
    page,
    setPage,
    records,
    visibleRecords,
    alerts,
    statuses,
    crew,
    isLive: state.viewDay === MISSION.currentDay,
    setViewDay: (d) => setState((s) => ({ ...s, viewDay: Math.min(MISSION.currentDay, Math.max(minViewDay(), Math.round(d))) })),
    setTheme: (t) => setState((s) => ({ ...s, theme: t })),
    setSelectedAstronautId: (id) => setState((s) => ({ ...s, selectedAstronautId: id })),
    setLastScenario: (p) => setState((s) => ({ ...s, lastScenario: p })),
    setChat: (fn) => setState((s) => ({ ...s, chat: fn(s.chat).slice(-60) })),
    setTourSeen: (v) => setState((s) => ({ ...s, tourSeen: v })),

    logReading: (id, raw) =>
      setState((s) => {
        const day = s.viewDay
        const value = Number(raw)
        if (!Number.isFinite(value)) return s
        const at = Date.now()

        const readings = [...s.log.readings.filter((r) => !(r.id === id && r.day === day)), { id, value, day, at }]
        let next: CrewLog = { ...s.log, readings, points: s.log.points + pointsForReading(id, value) }

        // Completing the battery advances the streak exactly once per day
        if (batteryComplete(next, day) && next.lastBatteryDay !== day) {
          const consecutive = next.lastBatteryDay === day - 1
          next = {
            ...next,
            lastBatteryDay: day,
            batteriesLogged: next.batteriesLogged + 1,
            streak: consecutive ? next.streak + 1 : 1,
            points: next.points + 50,
            cleared: { ...next.cleared, battery: day },
          }
        }

        const earned = newlyEarned(next, day)
        if (earned.length) next = { ...next, patches: [...next.patches, ...earned], points: next.points + earned.length * 40 }
        if (!next.periodOpenedAt) next = { ...next, periodOpenedAt: at }
        return { ...s, log: next }
      }),

    clearProtocol: (id) =>
      setState((s) => {
        const day = s.viewDay
        if (s.log.cleared[id] === day) return s
        const pts = { battery: 50, resistive: 35, aerobic: 25, hydration: 15, shelter: 30, conference: 20 }[id] ?? 10
        let next: CrewLog = {
          ...s.log,
          cleared: { ...s.log.cleared, [id]: day },
          points: s.log.points + pts,
          periodOpenedAt: s.log.periodOpenedAt || Date.now(),
        }
        const earned = newlyEarned(next, day)
        if (earned.length) next = { ...next, patches: [...next.patches, ...earned], points: next.points + earned.length * 40 }
        return { ...s, log: next }
      }),

    recordVeilProgress: (steps) =>
      setState((s) => {
        // Only steps not already banked count, so revisiting the visor cannot farm points.
        const fresh = steps.filter((id) => !s.log.veil.includes(id))
        if (!fresh.length) return s
        const gained = fresh.reduce((sum, id) => sum + pointsForVeilStep(id), 0)
        let next: CrewLog = {
          ...s.log,
          veil: [...s.log.veil, ...fresh],
          points: s.log.points + gained,
          periodOpenedAt: s.log.periodOpenedAt || Date.now(),
        }
        const earned = newlyEarned(next, s.viewDay)
        if (earned.length) next = { ...next, patches: [...next.patches, ...earned], points: next.points + earned.length * 40 }
        return { ...s, log: next }
      }),

    openPeriod: () => setState((s) => ({ ...s, log: { ...s.log, periodOpenedAt: Date.now() } })),
    resetDemo: () => {
      try {
        localStorage.removeItem(LS_KEY)
        localStorage.removeItem('aurora.veil.actions.v1')
      } catch {
        /* ignore */
      }
      setState({ ...defaultState(missionKey), tourSeen: true })
      setPage('mission-control')
    },
  }

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>
}

export function useMission(): MissionState {
  const ctx = useContext(MissionContext)
  if (!ctx) throw new Error('useMission must be used inside MissionProvider')
  return ctx
}

export { MISSION, EVENTS, ASTRONAUTS }
