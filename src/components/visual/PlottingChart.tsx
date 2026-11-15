import { useState } from 'react'
import type { MissionEvent } from '../../types'
import { MISSION, PHASES } from '../../data/mission'
import { fmtDate } from '../../lib/format'

/**
 * The mission profile drawn as a polar plotting chart, in the manner of the
 * trajectory charts issued for Apollo: black line work on aged stock, with a
 * typed table of significant events beside it.
 *
 * The encoding is real. Angle is mission day around the full circle; radius is
 * the mission phase, innermost at departure and outermost at return. Events sit
 * at their own day and phase. Nothing is drawn that the data does not contain.
 */

const SIZE = 464
const C = SIZE / 2
const R0 = 72
const RSTEP = 20

const angleFor = (day: number) => (-90 + (day / MISSION.totalDays) * 360) * (Math.PI / 180)
const radiusFor = (day: number) => {
  const i = PHASES.findIndex((p) => day >= p.startDay && day <= p.endDay)
  return R0 + Math.max(0, i) * RSTEP
}
const pt = (day: number, r = radiusFor(day)) => [C + Math.cos(angleFor(day)) * r, C + Math.sin(angleFor(day)) * r] as const

function arc(startDay: number, endDay: number, r: number) {
  const [x0, y0] = pt(startDay, r)
  const [x1, y1] = pt(endDay, r)
  const sweepDeg = ((endDay - startDay) / MISSION.totalDays) * 360
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

export function PlottingChart({
  events,
  viewDay,
  onSelectDay,
  className = '',
}: {
  events: MissionEvent[]
  viewDay: number
  onSelectDay?: (d: number) => void
  className?: string
}) {
  const [hover, setHover] = useState<MissionEvent | null>(null)
  const [cx, cy] = pt(viewDay)
  const currentPhase = PHASES.findIndex((p) => viewDay >= p.startDay && viewDay <= p.endDay)
  const past = events.filter((e) => e.day <= viewDay)
  const recent = [...past].slice(-7).reverse()

  return (
    <div className={`stock relative ${className}`}>
      <div className="relative grid gap-6 p-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:p-7">
        {/* ------------------------------------------------------- the chart */}
        <div>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block w-full" aria-label="Mission profile plotting chart">
            <g stroke="var(--ink)" fill="none">
              {/* Radial gridlines every 45° of mission time */}
              <g strokeWidth="0.4" strokeOpacity="0.35">
                {Array.from({ length: 8 }, (_, i) => {
                  const a = (-90 + i * 45) * (Math.PI / 180)
                  return (
                    <line
                      key={i}
                      x1={C + Math.cos(a) * 40}
                      y1={C + Math.sin(a) * 40}
                      x2={C + Math.cos(a) * 204}
                      y2={C + Math.sin(a) * 204}
                    />
                  )
                })}
              </g>

              {/* One reference ring per phase */}
              <g strokeWidth="0.4" strokeOpacity="0.3">
                {PHASES.map((p, i) => (
                  <circle key={p.id} cx={C} cy={C} r={R0 + i * RSTEP} />
                ))}
              </g>
              <circle cx={C} cy={C} r="204" strokeWidth="0.7" strokeOpacity="0.6" />
              <circle cx={C} cy={C} r="40" strokeWidth="0.7" strokeOpacity="0.6" />

              {/* Phase arcs — elapsed solid, remaining dashed */}
              {PHASES.map((p, i) => {
                const r = R0 + i * RSTEP
                const elapsedEnd = Math.min(p.endDay, viewDay)
                return (
                  <g key={p.id}>
                    <path d={arc(p.startDay, p.endDay, r)} strokeWidth="1" strokeDasharray="2 3" strokeOpacity="0.55" />
                    {viewDay > p.startDay && (
                      <path d={arc(p.startDay, elapsedEnd, r)} strokeWidth="2" strokeOpacity="0.95" />
                    )}
                    {/* Step up to the next phase ring */}
                    {i < PHASES.length - 1 && (
                      <line
                        x1={pt(p.endDay, r)[0]}
                        y1={pt(p.endDay, r)[1]}
                        x2={pt(p.endDay, r + RSTEP)[0]}
                        y2={pt(p.endDay, r + RSTEP)[1]}
                        strokeWidth="0.7"
                        strokeOpacity="0.6"
                      />
                    )}
                  </g>
                )
              })}

              {/* Present-day radius */}
              <line x1={C} y1={C} x2={cx} y2={cy} strokeWidth="0.7" strokeOpacity="0.75" strokeDasharray="3 2" />
            </g>

            {/* Events */}
            {events.map((e) => {
              const [x, y] = pt(e.day)
              const isPast = e.day <= viewDay
              return (
                <g
                  key={e.id}
                  onMouseEnter={() => setHover(e)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(e)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelectDay?.(Math.min(MISSION.currentDay, Math.max(45, e.endDay ?? e.day)))}
                  tabIndex={0}
                  role="button"
                  aria-label={`${e.title}, mission day ${e.day}`}
                  className="cursor-pointer outline-none"
                >
                  <circle cx={x} cy={y} r="7" fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={e.severity === 'caution' ? 3.4 : 2.6}
                    fill={isPast ? 'var(--ink)' : 'none'}
                    stroke="var(--ink)"
                    strokeWidth="0.9"
                    opacity={isPast ? 1 : 0.5}
                  />
                  {e.severity === 'caution' && (
                    <circle cx={x} cy={y} r="6" fill="none" stroke="var(--rust)" strokeWidth="0.9" />
                  )}
                </g>
              )
            })}

            {/* Present-day marker */}
            <g>
              <circle cx={cx} cy={cy} r="5" fill="none" stroke="var(--ink)" strokeWidth="1.4" />
              <circle cx={cx} cy={cy} r="1.6" fill="var(--ink)" />
            </g>

            {/* Lettering */}
            <g fill="var(--ink)" style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '0.08em' }}>
              {[0, 1, 2, 3].map((i) => {
                const day = Math.round((i / 4) * MISSION.totalDays)
                const a = (-90 + i * 90) * (Math.PI / 180)
                return (
                  <text
                    key={i}
                    x={C + Math.cos(a) * 216}
                    y={C + Math.sin(a) * 216 + 3}
                    textAnchor="middle"
                    fillOpacity="0.7"
                  >
                    MD {day}
                  </text>
                )
              })}
              <text x={C} y={C - 4} textAnchor="middle" style={{ fontSize: 8, letterSpacing: '0.12em' }}>
                EARTH
              </text>
              <text x={C} y={C + 8} textAnchor="middle" fillOpacity="0.65" style={{ fontSize: 7 }}>
                DEPARTURE
              </text>
            </g>
          </svg>

          <p className="mt-3 border-t border-ink/25 pt-2 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
            Angle: mission day · Radius: phase · {events.length} plotted events
          </p>
        </div>

        {/* ------------------------------------------------ significant events */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-1.5">
            <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink">
              {MISSION.name} significant events
            </h4>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
              MD {viewDay} · {PHASES[Math.max(0, currentPhase)].name}
            </span>
          </div>

          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-ink/30">
                <th className="w-12 py-1.5 text-left font-mono text-[9px] font-normal uppercase tracking-[0.1em] text-ink-soft">MD</th>
                <th className="py-1.5 text-left font-mono text-[9px] font-normal uppercase tracking-[0.1em] text-ink-soft">Event</th>
                <th className="hidden w-24 py-1.5 text-left font-mono text-[9px] font-normal uppercase tracking-[0.1em] text-ink-soft sm:table-cell">
                  Date
                </th>
                <th className="w-20 py-1.5 text-right font-mono text-[9px] font-normal uppercase tracking-[0.1em] text-ink-soft">Type</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr
                  key={e.id}
                  onMouseEnter={() => setHover(e)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelectDay?.(Math.min(MISSION.currentDay, Math.max(45, e.endDay ?? e.day)))}
                  className="cursor-pointer border-b border-ink/15 align-top transition-colors hover:bg-ink/[0.06]"
                >
                  <td className="py-1.5 font-mono text-[10px] tabular-nums text-ink">{e.day}</td>
                  <td className="py-1.5 pr-3 text-[11px] leading-snug text-ink">
                    {e.title}
                    {e.severity === 'caution' && <span className="ml-1.5 font-mono text-[9px] uppercase text-rust">caution</span>}
                  </td>
                  <td className="hidden py-1.5 font-mono text-[9px] uppercase tabular-nums text-ink-soft sm:table-cell">
                    {fmtDate(e.day)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.08em] text-ink-soft">{e.type}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 min-h-[52px] border border-ink/25 p-2.5">
            {hover ? (
              <>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                  MD {hover.day}
                  {hover.endDay ? `–${hover.endDay}` : ''} · {fmtDate(hover.day).toUpperCase()} · {hover.type.toUpperCase()}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-ink">{hover.description}</p>
              </>
            ) : (
              <p className="text-[11px] leading-snug text-ink-soft">
                Hover a plotted event or a table row for details. Click either to set the mission view to that day.
                Events after the current day are drawn open.
              </p>
            )}
          </div>

          <p className="mt-3 border-t border-ink/25 pt-2 font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-ink-soft">
            Chart AUR-002 · prepared for {MISSION.designation} · {MISSION.totalDays}-day profile ·
            crew values synthetic
          </p>
        </div>
      </div>
    </div>
  )
}
