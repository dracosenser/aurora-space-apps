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

/** Departure → transit → arrival → surface (ember, for Mars) → return → recovery. */
const PHASE_COLORS = ['#5b86d6', '#7aa7ff', '#9ec4ff', '#ff8f52', '#9ec4ff', '#7aa7ff', '#4fd6c0']

export function TimelineStrip({ events, viewDay, onSelectDay }: { events: MissionEvent[]; viewDay: number; onSelectDay?: (d: number) => void }) {
  const [hover, setHover] = useState<MissionEvent | null>(null)
  const total = MISSION.totalDays
  const pct = (d: number) => `${((d - 1) / (total - 1)) * 100}%`

  return (
    <div>
      <div className="relative h-16">
        {/* phases, ruled as a continuous band */}
        <div className="absolute inset-x-0 top-6 flex h-[7px] overflow-hidden rounded-xs border border-border">
          {PHASES.map((p, i) => (
            <div
              key={p.id}
              title={`${p.name} (MD ${p.startDay}–${p.endDay})`}
              style={{ width: `${((p.endDay - p.startDay + 1) / total) * 100}%`, background: PHASE_COLORS[i], opacity: p.endDay <= viewDay ? 0.8 : p.startDay <= viewDay ? 0.55 : 0.16 }}
              className="h-full border-r border-bg/70 last:border-r-0"
            />
          ))}
        </div>
        {/* the future, held back */}
        <div className="pointer-events-none absolute top-6 h-[7px] bg-bg/60" style={{ left: pct(viewDay), right: 0 }} />
        {/* present-day index */}
        <div className="absolute top-2 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(viewDay) }}>
          <span className="mono rounded-xs border border-accent/50 bg-bg px-1 py-px text-[9px] font-semibold tracking-wide text-accent">MD {viewDay}</span>
          <span className="h-10 w-px bg-accent/70" />
        </div>
        {/* events */}
        {events.map((e) => {
          const Icon = EVENT_ICONS[e.type]
          const past = e.day <= viewDay
          return (
            <button
              key={e.id}
              className={`absolute top-10 -translate-x-1/2 rounded-xs border p-1 transition-transform duration-200 hover:scale-125 ${past ? 'border-border-strong bg-surface-2' : 'border-border bg-surface opacity-45'}`}
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
      <div className="mt-3 min-h-[52px] rounded-sm border border-border bg-surface-2/50 px-3.5 py-2.5 text-xs">
        {hover ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(hover.severity)}>{hover.type}</Badge>
            <span className="font-semibold text-text-strong">{hover.title}</span>
            <span className="annotate">
              MD {hover.day}
              {hover.endDay ? `–${hover.endDay}` : ''} · {fmtDate(hover.day).toUpperCase()}
            </span>
            <span className="w-full leading-relaxed text-muted">{hover.description}</span>
          </div>
        ) : (
          <span className="leading-relaxed text-muted">Hover an event marker for details. Click one to jump the mission view to that day. Future planned events appear dimmed.</span>
        )}
      </div>
    </div>
  )
}
