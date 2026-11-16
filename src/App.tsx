import { Suspense, lazy, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMission } from './hooks/useMission'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { GuidedTour } from './components/GuidedTour'
import { Atmosphere } from './components/visual/Atmosphere'
import { MissionControl } from './pages/MissionControl'

const SelfCheck = lazy(() => import('./pages/SelfCheck').then((m) => ({ default: m.SelfCheck })))
const SignalVeil = lazy(() => import('./pages/SignalVeil').then((m) => ({ default: m.SignalVeil })))
const FlightDeckPage = lazy(() => import('./pages/FlightDeckPage').then((m) => ({ default: m.FlightDeckPage })))
const MissionBuilder = lazy(() => import('./pages/MissionBuilder').then((m) => ({ default: m.MissionBuilder })))
const MedicalMonitor = lazy(() => import('./pages/MedicalMonitor').then((m) => ({ default: m.MedicalMonitor })))
const Workbench = lazy(() => import('./pages/Workbench').then((m) => ({ default: m.Workbench })))
const CrewHealth = lazy(() => import('./pages/CrewHealth').then((m) => ({ default: m.CrewHealth })))
const EarlyWarning = lazy(() => import('./pages/EarlyWarning').then((m) => ({ default: m.EarlyWarning })))
const Simulator = lazy(() => import('./pages/Simulator').then((m) => ({ default: m.Simulator })))
const Assistant = lazy(() => import('./pages/Assistant').then((m) => ({ default: m.Assistant })))
const Sources = lazy(() => import('./pages/Sources').then((m) => ({ default: m.Sources })))
const Presentation = lazy(() => import('./pages/Presentation').then((m) => ({ default: m.Presentation })))

export default function App() {
  const { page, tourSeen } = useMission()
  const [menuOpen, setMenuOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  useEffect(() => {
    if (!tourSeen) {
      const t = window.setTimeout(() => setTourOpen(true), 900)
      return () => window.clearTimeout(t)
    }
  }, [tourSeen])

  return (
    <div className="grain relative flex min-h-screen">
      {/* Deep-field backdrop, behind everything, mounted once */}
      <Atmosphere />

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Doc-control bar — the document metadata strip the frame always carries */}
        <div className="flex items-center gap-x-5 gap-y-1 overflow-hidden border-b border-border px-4 py-1.5 md:px-6">
          <span className="annotate shrink-0">DOC NO. AUR-MED-01</span>
          <span className="annotate hidden shrink-0 sm:inline">REV C</span>
          <span className="annotate hidden shrink-0 md:inline">FORM 8-246</span>
          <span className="annotate ml-auto shrink-0 text-ember">SYNTHETIC CREW DATA</span>
        </div>
        <TopBar onMenu={() => setMenuOpen(true)} onTour={() => setTourOpen(true)} />
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-5 md:px-6">
          <Suspense
            fallback={
              <div className="flex flex-col items-center gap-3 py-28">
                <span className="h-px w-16 animate-pulse bg-border-strong" />
                <p className="eyebrow-sm">Loading module</p>
              </div>
            }
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                {page === 'mission-control' && <MissionControl />}
                {page === 'self-check' && <SelfCheck />}
              {page === 'signal-veil' && <SignalVeil />}
              {page === 'flight-deck' && <FlightDeckPage />}
                {page === 'workbench' && <Workbench />}
                {page === 'missions' && <MissionBuilder />}
                {page === 'medical' && <MedicalMonitor />}
                {page === 'crew-health' && <CrewHealth />}
                {page === 'early-warning' && <EarlyWarning />}
                {page === 'simulator' && <Simulator />}
                {page === 'assistant' && <Assistant />}
                {page === 'sources' && <Sources />}
                {page === 'presentation' && <Presentation />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>

        <footer className="relative z-10 mt-6 border-t border-border px-4 py-5 md:px-6">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2">
            <span className="annotate">AURORA — ASTRONAUT HEALTH INTELLIGENCE</span>
            <span className="annotate hidden sm:inline">NASA SPACE APPS CHALLENGE 2026</span>
            <span className="annotate ml-auto text-ember">SYNTHETIC CREW DATA · NOT A NASA PRODUCT</span>
          </div>
        </footer>
      </div>

      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  )
}
