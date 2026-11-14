import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { PageId } from '../types'
import { useMission } from '../hooks/useMission'
import { Button } from './ui/Button'
import { Logo } from './layout/Sidebar'

const STEPS: { page: PageId; title: string; body: string }[] = [
  {
    page: 'mission-control',
    title: 'Welcome to AURORA',
    body: 'AURORA is an astronaut health-intelligence platform for long-duration missions. You are looking at a fictional 900-day Mars mission on day 412 with a crew of four. Every crew value is simulated; every scientific source is real and cited.',
  },
  {
    page: 'mission-control',
    title: 'Mission Control',
    body: 'The dashboard shows mission elapsed time, phase, crew composite status, each astronaut, recent alerts and the mission timeline. Use the playback slider in the top bar to scrub back through mission history; alerts and scores recompute for that day.',
  },
  {
    page: 'crew-health',
    title: 'Crew Health Analytics',
    body: 'Five categories of indicators: cardiovascular, sleep, physical, radiation and behavioral. Filter by date range, pick an astronaut or compare the whole crew, and read the trend table. Charts show the alert windows and mission events in context.',
  },
  {
    page: 'early-warning',
    title: 'Early Warning Intelligence',
    body: 'Transparent statistical rules flag unusual changes: level shifts, sleep irregularity, fatigue-plus-exercise combinations, multi-indicator patterns and radiation events. Expand an alert to see exactly what changed, why, the confidence rationale and what to review. Anomalies are not diagnoses.',
  },
  {
    page: 'simulator',
    title: 'Mission What-If Simulator',
    body: 'Change mission duration, sleep disruption, exercise frequency, radiation scenario and stress. Curves update instantly against the baseline plan with an explanation, operational considerations and explicit assumptions. These are illustrative models, not predictions.',
  },
  {
    page: 'assistant',
    title: 'Mission Assistant',
    body: 'Ask questions in plain language. The assistant computes answers from the data in the app, shows its reasoning and separates facts from hypotheses. It runs locally with rules; no external AI service is involved.',
  },
  {
    page: 'sources',
    title: 'Sources & Science',
    body: 'Every real NASA program, dataset, standard and peer-reviewed paper that informed AURORA, with what it represents and its limitations, kept strictly separate from the synthetic demo data.',
  },
]

export function GuidedTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const { setPage, setTourSeen } = useMission()

  useEffect(() => {
    if (open) {
      setI(0)
      setPage(STEPS[0].page)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const go = (n: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, n))
    setI(next)
    setPage(STEPS[next].page)
  }

  const finish = () => {
    setTourSeen(true)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-4 right-4 left-4 z-50 mx-auto max-w-md rounded-lg border border-accent/40 bg-surface p-4 shadow-2xl md:left-auto">
          <div className="flex items-start gap-3">
            <Logo size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Guided demo · {i + 1} / {STEPS.length}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-text-strong">{STEPS[i].title}</p>
              <p className="mt-1 text-xs leading-relaxed text-text">{STEPS[i].body}</p>
            </div>
            <button onClick={finish} className="rounded p-1 text-muted hover:text-text-strong" aria-label="Close tour">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1">
              {STEPS.map((_, k) => (
                <span key={k} className={`h-1 w-4 rounded-full ${k <= i ? 'bg-accent' : 'bg-border-strong'}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => go(i - 1)} disabled={i === 0} icon={<ArrowLeft className="h-3.5 w-3.5" />}>
                Back
              </Button>
              {i < STEPS.length - 1 ? (
                <Button size="sm" variant="primary" onClick={() => go(i + 1)} icon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Next
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={finish}>
                  Start exploring
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
