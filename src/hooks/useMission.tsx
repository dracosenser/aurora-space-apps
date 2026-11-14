import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Alert, AssistantMessage, DailyRecord, PageId, ScenarioParams } from '../types'
import { ASTRONAUTS } from '../data/astronauts'
import { EVENTS, MISSION } from '../data/mission'
import { generateMissionRecords } from '../data/generator'
import { detectAnomalies } from '../lib/anomaly'
import { computeStatus, crewScore, type AstronautStatus } from '../lib/health'

/**
 * Lightweight local data layer. Synthetic records are generated once from a
 * fixed seed; user state (view day, theme, selections, chat) persists to
 * localStorage and can be reset with "Reset demo".
 */

const LS_KEY = 'aurora.state.v1'

interface PersistedState {
  viewDay: number
  theme: 'dark' | 'light'
  selectedAstronautId: string
  lastScenario: ScenarioParams | null
  chat: AssistantMessage[]
  tourSeen: boolean
}

const DEFAULT_STATE: PersistedState = {
  viewDay: MISSION.currentDay,
  theme: 'dark',
  selectedAstronautId: ASTRONAUTS[0].id,
  lastScenario: null,
  chat: [],
  tourSeen: false,
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return { ...DEFAULT_STATE, ...parsed, viewDay: Math.min(MISSION.currentDay, Math.max(45, parsed.viewDay ?? MISSION.currentDay)) }
  } catch {
    return DEFAULT_STATE
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
  resetDemo: () => void
  isLive: boolean
}

const MissionContext = createContext<MissionState | null>(null)

function pageFromHash(): PageId {
  const h = (window.location.hash || '').replace('#/', '').replace('#', '') as PageId
  const valid: PageId[] = ['mission-control', 'crew-health', 'early-warning', 'simulator', 'assistant', 'sources', 'presentation']
  return valid.includes(h) ? h : 'mission-control'
}

export function MissionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
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
    const onHash = () => {
      console.log('[aurora] hashchange ->', window.location.hash, pageFromHash())
      setPageState(pageFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const setPage = useCallback((p: PageId) => {
    window.location.hash = `/${p}`
    setPageState(p)
    window.scrollTo({ top: 0 })
  }, [])

  const records = useMemo(() => generateMissionRecords(MISSION.currentDay), [])
  const visibleRecords = useMemo(() => records.filter((r) => r.day <= state.viewDay), [records, state.viewDay])
  const alerts = useMemo(() => detectAnomalies(records, ASTRONAUTS, state.viewDay), [records, state.viewDay])
  const statuses = useMemo(() => ASTRONAUTS.map((a) => computeStatus(a, records, alerts, state.viewDay)), [records, alerts, state.viewDay])
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
    setViewDay: (d) => setState((s) => ({ ...s, viewDay: Math.min(MISSION.currentDay, Math.max(45, Math.round(d))) })),
    setTheme: (t) => setState((s) => ({ ...s, theme: t })),
    setSelectedAstronautId: (id) => setState((s) => ({ ...s, selectedAstronautId: id })),
    setLastScenario: (p) => setState((s) => ({ ...s, lastScenario: p })),
    setChat: (fn) => setState((s) => ({ ...s, chat: fn(s.chat).slice(-60) })),
    setTourSeen: (v) => setState((s) => ({ ...s, tourSeen: v })),
    resetDemo: () => {
      try {
        localStorage.removeItem(LS_KEY)
      } catch {
        /* ignore */
      }
      setState({ ...DEFAULT_STATE, tourSeen: true })
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
