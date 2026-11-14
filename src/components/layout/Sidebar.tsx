import { Activity, BookOpen, Bot, FlaskConical, LayoutDashboard, Presentation, ShieldAlert, X, type LucideIcon } from 'lucide-react'
import type { PageId } from '../../types'
import { useMission } from '../../hooks/useMission'

export const NAV: { id: PageId; label: string; icon: LucideIcon; group: 'operations' | 'about' }[] = [
  { id: 'mission-control', label: 'Mission Control', icon: LayoutDashboard, group: 'operations' },
  { id: 'crew-health', label: 'Crew Health Analytics', icon: Activity, group: 'operations' },
  { id: 'early-warning', label: 'Early Warning', icon: ShieldAlert, group: 'operations' },
  { id: 'simulator', label: 'What-If Simulator', icon: FlaskConical, group: 'operations' },
  { id: 'assistant', label: 'Mission Assistant', icon: Bot, group: 'operations' },
  { id: 'sources', label: 'Sources & Science', icon: BookOpen, group: 'about' },
  { id: 'presentation', label: 'Space Apps Presentation', icon: Presentation, group: 'about' },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, setPage, alerts } = useMission()
  const activeCount = alerts.filter((a) => a.active && a.severity !== 'info').length

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <button onClick={() => setPage('mission-control')} className="flex items-center gap-2.5 text-left">
          <Logo />
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-text-strong">AURORA</p>
            <p className="text-[10px] leading-tight text-muted">Astronaut Health Intelligence</p>
          </div>
        </button>
        <button className="rounded p-1 text-muted hover:text-text-strong lg:hidden" onClick={onClose} aria-label="Close navigation">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 px-2">
        {(['operations', 'about'] as const).map((group) => (
          <div key={group}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{group === 'operations' ? 'Operations' : 'Project'}</p>
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.group === group).map((n) => {
                const active = page === n.id
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        setPage(n.id)
                        onClose()
                      }}
                      className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] transition-colors ${
                        active ? 'bg-accent/10 text-accent' : 'text-text hover:bg-surface-3 hover:text-text-strong'
                      }`}
                    >
                      <span className={`h-4 w-0.5 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
                      <n.icon className={`h-4 w-4 ${active ? 'text-accent' : 'text-muted group-hover:text-text-strong'}`} />
                      <span className="flex-1">{n.label}</span>
                      {n.id === 'early-warning' && activeCount > 0 && (
                        <span className="mono rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">{activeCount}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted">
        <p className="font-medium text-text">NASA Space Apps Challenge 2026</p>
        <p>Every explorer matters. Every signal counts.</p>
        <p className="mt-1.5 text-warn/90">All crew data shown is simulated.</p>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface shadow-2xl">{content}</aside>
        </div>
      )}
    </>
  )
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <rect width="64" height="64" rx="14" fill="var(--surface-3)" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <circle cx="32" cy="32" r="6" fill="var(--accent)" />
      <path d="M8 32h10M46 32h10M32 8v10M32 46v10" stroke="var(--accent-2)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
