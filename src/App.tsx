import { Suspense, lazy, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMission } from './hooks/useMission'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { GuidedTour } from './components/GuidedTour'
import { MissionControl } from './pages/MissionControl'

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
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} onTour={() => setTourOpen(true)} />
        <main className="flex-1 px-4 py-5 md:px-6">
          <Suspense fallback={<div className="py-20 text-center text-sm text-muted">Loading module…</div>}>
            <AnimatePresence mode="wait">
              <motion.div key={page} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                {page === 'mission-control' && <MissionControl />}
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
      </div>
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  )
}
