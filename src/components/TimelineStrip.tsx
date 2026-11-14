import { useState } from 'react'
import { Flag, Radiation, Wrench, Activity, Stethoscope, RadioTower, CloudFog } from 'lucide-react'
import type { EventType, MissionEvent } from '../types'
import { MISSION, PHASES } from '../data/mission'
import { fmtDate } from '../lib/format'
import { Badge, severityTone } from './ui/Badge'

export const EVENT_ICONS: Record<EventType, typeof Flag> = {
  milestone: Flag,
  radiation: Radiation,
  systems: Wrench,
  operations: Activity,
  medical: Stethoscope,
  communications: RadioTower,
  environment: CloudFog,
}

const PHASE_COLORS = ['#3b82f6', '#22d3ee', '#3b82f6', '#f59e0b', '#3b82f6', '#22d3ee', '#34d399']

export function TimelineStrip({ events, viewDay, onSelectDay }: { events: MissionEvent[]; viewDay: number; onSelectDay?: (d: number) => void }) {
  const [hover, setHover] = useState<MissionEvent | null>(null)
  const total = MISSION.totalDays
  const pct = (d: number) => `${((d - 1) / (total - 1)) * 100}%`

  return (
    <div>
      <div className="relative h-16">
        {/* phases */}
        <div className="absolute inset-x-0 top-6 flex h-3 overflow-hidden rounded-full border border-border">
          {PHASES.map((p, i) => (
            <div
              key={p.id}
              title={`${p.name} (MD ${p.startDay}–${p.endDay})`}
              style={{ width: `${((p.endDay - p.startDay + 1) / total) * 100}%`, background: PHASE_COLORS[i], opacity: p.endDay <= viewDay ? 0.85 : p.startDay <= viewDay ? 0.6 : 0.2 }}
              className="h-full border-r border-bg/60 last:border-r-0"
            />
          ))}
        </div>
        {/* future overlay */}
        <div className="pointer-events-none absolute top-6 h-3 rounded-r-full bg-bg/50" style={{ left: pct(viewDay), right: 0 }} />
        {/* current marker */}
        <div className="absolute top-3 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(viewDay) }}>
          <span className="mono rounded bg-accent px-1 text-[9px] font-semibold text-[#04121a]">MD {viewDay}</span>
          <span className="h-9 w-px bg-accent" />
        </div>
        {/* events */}
        {events.map((e) => {
          const Icon = EVENT_ICONS[e.type]
          const past = e.day <= viewDay
          return (
            <button
              key={e.id}
              className={`absolute top-10 -translate-x-1/2 rounded-full border p-1 transition-transform hover:scale-110 ${past ? 'border-border-strong bg-surface-2' : 'border-border bg-surface opacity-50'}`}
              style={{ left: pct(e.day) }}
              onMouseEnter={() => setHover(e)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(e)}
              onBlur={() => setHover(null)}
              onClick={() => onSelectDay?.(Math.min(MISSION.currentDay, Math.max(45, e.endDay ?? e.day)))}
              aria-label={e.title}
            >
              <Icon className={`h-3 w-3 ${e.severity === 'caution' ? 'text-danger' : e.severity === 'watch' ? 'text-warn' : 'text-accent'}`} />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        {PHASES.map((p) => (
          <span key={p.id} className="hidden truncate md:inline" style={{ width: `${((p.endDay - p.startDay + 1) / total) * 100}%` }}>
            {p.endDay - p.startDay > 60 ? p.name : ''}
          </span>
        ))}
      </div>
      <div className="mt-2 min-h-[44px] rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
        {hover ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(hover.severity)}>{hover.type}</Badge>
            <span className="font-semibold text-text-strong">{hover.title}</span>
            <span className="mono text-muted">
              MD {hover.day}
              {hover.endDay ? `–${hover.endDay}` : ''} · {fmtDate(hover.day)}
            </span>
            <span className="w-full text-muted">{hover.description}</span>
          </div>
        ) : (
          <span className="text-muted">Hover an event marker for details. Click one to jump the mission view to that day. Future planned events appear dimmed.</span>
        )}
      </div>
    </div>
  )
}
