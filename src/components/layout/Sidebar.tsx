import { Activity, BookOpen, Bot, FlaskConical, HeartPulse, LayoutDashboard, Presentation, Rocket, ShieldAlert, SlidersHorizontal, Orbit, Stethoscope, Sparkles, X, type LucideIcon } from 'lucide-react'
import type { PageId } from '../../types'
import { useMission } from '../../hooks/useMission'
import { Insignia } from '../visual/Insignia'

export const NAV: { id: PageId; label: string; icon: LucideIcon; group: 'operations' | 'about' }[] = [
  { id: 'mission-control', label: 'Mission Control', icon: LayoutDashboard, group: 'operations' },
  { id: 'missions', label: 'Mission Builder', icon: Orbit, group: 'operations' },
  { id: 'medical', label: 'Medical Monitor', icon: Stethoscope, group: 'operations' },
  { id: 'self-check', label: 'Self-Assessment', icon: HeartPulse, group: 'operations' },
  { id: 'signal-veil', label: 'Signal Veil', icon: Sparkles, group: 'operations' },
  { id: 'flight-deck', label: 'Flight Deck', icon: Rocket, group: 'operations' },
  { id: 'workbench', label: 'Mission Workbench', icon: SlidersHorizontal, group: 'operations' },
  { id: 'crew-health', label: 'Crew Health Analytics', icon: Activity, group: 'operations' },
  { id: 'early-warning', label: 'Early Warning', icon: ShieldAlert, group: 'operations' },
  { id: 'simulator', label: 'What-If Simulator', icon: FlaskConical, group: 'operations' },
  { id: 'assistant', label: 'Mission Assistant', icon: Bot, group: 'operations' },
  { id: 'sources', label: 'Sources & Science', icon: BookOpen, group: 'about' },
  { id: 'presentation', label: 'Space Apps Presentation', icon: Presentation, group: 'about' },
]

/**
 * The index of the archive. Sections are numbered like plates in a catalogue;
 * the active one is marked with an accent rule rather than a filled block.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, setPage, alerts } = useMission()
  const activeCount = alerts.filter((a) => a.active && a.severity !== 'info').length

  const content = (
    <div className="flex h-full flex-col">
      {/* Masthead */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 pb-5 pt-6">
        <button onClick={() => setPage('mission-control')} className="group flex items-center gap-3 text-left">
          <Insignia size={32} className="text-text-strong" />
          <div>
            <p className="display text-[22px] leading-none tracking-[0.04em]">AURORA</p>
            <p className="eyebrow-sm mt-1.5">Health Intelligence</p>
          </div>
        </button>
        <button className="rounded-sm p-1 text-muted transition-colors hover:text-text-strong lg:hidden" onClick={onClose} aria-label="Close navigation">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {(['operations', 'about'] as const).map((group) => (
          <div key={group} className="mb-6 last:mb-0">
            <p className="eyebrow-sm border-b border-border px-4 py-3">{group === 'operations' ? 'Operations' : 'Project'}</p>
            <ul>
              {NAV.filter((n) => n.group === group).map((n) => {
                const active = page === n.id
                const index = NAV.findIndex((x) => x.id === n.id) + 1
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        setPage(n.id)
                        onClose()
                      }}
                      className={`group relative flex w-full items-center gap-3 border-b border-border py-3 pl-4 pr-2 text-left text-[13px] transition-colors duration-300 ${
                        active ? 'text-text-strong' : 'text-text hover:text-text-strong'
                      }`}
                    >
                      {/* Active rule, drawn rather than filled */}
                      <span
                        className={`absolute left-0 top-0 bottom-px w-px transition-opacity duration-300 ${
                          active ? 'bg-text-strong opacity-100' : 'opacity-0'
                        }`}
                      />
                      <span className={`mono text-[10px] tabular-nums ${active ? 'text-text-strong' : 'text-faint'}`}>
                        {String(index).padStart(2, '0')}
                      </span>
                      <n.icon className={`h-[14px] w-[14px] shrink-0 ${active ? 'text-text-strong' : 'text-faint group-hover:text-muted'}`} />
                      <span className="flex-1 leading-snug">{n.label}</span>
                      {n.id === 'early-warning' && activeCount > 0 && (
                        <span className="mono border border-ember/40 px-1.5 py-px text-[10px] text-ember">{activeCount}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <p className="eyebrow-sm">NASA Space Apps 2026</p>
        <p className="display-italic mt-2.5 text-[14px] leading-snug text-text">
          Every explorer matters.
          <br />
          Every signal counts.
        </p>
        <p className="annotate mt-3 text-ember">ALL CREW DATA SIMULATED</p>
      </div>
    </div>
  )

  return (
    <>
      <aside className="relative z-20 hidden w-[248px] shrink-0 border-r border-border bg-bg lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-[272px] border-r border-border bg-bg">{content}</aside>
        </div>
      )}
    </>
  )
}

/** Retained export: the mark is the insignia. */
export { Insignia as Logo }
