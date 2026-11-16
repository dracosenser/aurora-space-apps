import { StrictMode, useMemo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { MissionProvider } from './hooks/useMission'
import { applyLaunch, launchedRun, useLaunchedMission } from './sim/launch'

/**
 * The launched mission drives the whole application. When a mission is
 * launched (Run simulation in the Mission Builder), its simulation replaces
 * the shared crew, mission and events, and the app remounts once on it.
 */
function LaunchedMission({ children }: { children: ReactNode }) {
  const launched = useLaunchedMission()
  const { key, records } = useMemo(() => {
    const { config, result } = launchedRun()
    return { key: result.fingerprint, records: applyLaunch(config, result) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launched])
  return (
    <MissionProvider key={key} records={records} missionKey={key}>
      {children}
    </MissionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LaunchedMission>
      <App />
    </LaunchedMission>
  </StrictMode>,
)
