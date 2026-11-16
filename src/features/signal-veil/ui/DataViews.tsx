import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { MissionAnalysis } from '../../../engine/analysis'
import type { RelationshipResult } from '../../../engine/types'
import { useElementWidth } from './charts'

/**
 * Whole-mission views of the engine's output, beside the visor:
 *  - a deviation map: every indicator × every day, coloured by its smoothed
 *    shift from the personal baseline (control-limit units);
 *  - the joint control chart: the multivariate T² statistic against its limit,
 *    which is what raises a combined pattern;
 *  - the relationship matrix: lagged rank correlation for every pair on the
 *    selected day, with the pairs the evidence supports marked.
 * Drawn with DOM, SVG and a 2D canvas. The visor's own rendering is untouched.
 */

type View = 'map' | 'joint' | 'matrix'

const COOL = 'var(--accent)'
const WARM = 'var(--danger)'
const LIMIT = 3

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v || fallback
}

function Tip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 max-w-64 border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-text shadow-lg" style={{ left: x + 12, top: y + 12 }}>
      {children}
    </div>
  )
}

// -------------------------------------------------------------- deviation map

function DeviationMap({ analysis, day, onPick }: { analysis: MissionAnalysis; day: number; onPick: (id: string, day: number) => void }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(640)
  const canvas = useRef<HTMLCanvasElement>(null)
  const rows = useMemo(() => [...analysis.timelines].sort((a, b) => a.def.category.localeCompare(b.def.category)), [analysis])
  const days = analysis.dataset.totalDays
  const labelW = 110
  const rowH = 14
  const top = 16
  const plotW = Math.max(60, width - labelW)
  const H = top + rows.length * rowH
  const [hover, setHover] = useState<{ x: number; y: number; r: number; d: number } | null>(null)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(plotW * dpr)
    c.height = Math.round(H * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, plotW, H)
    const neutral = cssVar(c, '--surface-3', '#2a2f3a')
    const cool = cssVar(c, '--accent', '#4f8cff')
    const warm = cssVar(c, '--danger', '#ef5350')
    const evt = cssVar(c, '--muted', '#888')
    const cw = plotW / days
    // Events along the top
    ctx.globalAlpha = 0.5
    ctx.fillStyle = evt
    for (const e of analysis.dataset.events) {
      const x0 = (e.day - 1) * cw
      const x1 = ((e.endDay ?? e.day) - 0) * cw
      ctx.fillRect(x0, 4, Math.max(1.5, x1 - x0), 6)
    }
    rows.forEach((tl, r) => {
      const y = top + r * rowH
      ctx.globalAlpha = 1
      ctx.fillStyle = neutral
      ctx.fillRect(0, y, plotW, rowH - 2)
      for (let i = 0; i < days; i++) {
        const s = tl.states[i]?.shift
        if (s === null || s === undefined) continue
        const a = Math.min(1, Math.abs(s) / LIMIT)
        if (a < 0.08) continue
        ctx.globalAlpha = a
        ctx.fillStyle = s > 0 ? warm : cool
        ctx.fillRect(i * cw, y, Math.max(1, cw + 0.3), rowH - 2)
      }
    })
    ctx.globalAlpha = 1
    ctx.strokeStyle = cssVar(c, '--text-strong', '#fff')
    ctx.lineWidth = 1.5
    const xd = (day - 0.5) * cw
    ctx.beginPath()
    ctx.moveTo(xd, 0)
    ctx.lineTo(xd, H)
    ctx.stroke()
  }, [analysis, rows, days, plotW, H, day])

  const locate = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - b.left
    const y = e.clientY - b.top
    const d = Math.min(days, Math.max(1, Math.floor((x / plotW) * days) + 1))
    const r = Math.floor((y - top) / rowH)
    return { x: x + labelW, y, r, d }
  }
  const h = hover && hover.r >= 0 && hover.r < rows.length ? rows[hover.r] : null
  const hs = h ? h.states[hover!.d - 1] : null

  return (
    <div>
      <div ref={wrap} className="relative flex">
        <div className="shrink-0" style={{ width: labelW, paddingTop: top }}>
          {rows.map((tl) => (
            <p key={tl.def.id} className="truncate pr-2 text-[10.5px] text-muted" style={{ height: rowH, lineHeight: `${rowH - 2}px` }} title={tl.def.label}>
              {tl.def.shortLabel || tl.def.label}
            </p>
          ))}
        </div>
        <canvas
          ref={canvas}
          style={{ width: plotW, height: H }}
          className="cursor-crosshair"
          role="img"
          aria-label="Deviation of every indicator from its personal baseline across the mission"
          onPointerMove={(e) => setHover(locate(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const p = locate(e)
            if (p.r >= 0 && p.r < rows.length) onPick(rows[p.r].def.id, p.d)
          }}
        />
        {h && hs && (
          <Tip x={hover!.x} y={hover!.y}>
            <p className="text-text-strong">
              {h.def.label} · day {hover!.d}
            </p>
            <p className="mono">
              {hs.value !== null ? `${hs.value.toFixed(h.def.decimals)} ${h.def.unit}` : 'no reading'}
              {hs.shift !== null ? ` · shift ${hs.shift > 0 ? '+' : ''}${hs.shift.toFixed(2)}` : ''}
            </p>
            <p className="text-muted">{hs.status.replace('-', ' ')}</p>
          </Tip>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-6" style={{ background: `linear-gradient(90deg, ${COOL}, var(--surface-3))` }} /> below baseline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-6" style={{ background: `linear-gradient(90deg, var(--surface-3), ${WARM})` }} /> above baseline
        </span>
        <span>Full colour = smoothed shift of {LIMIT} control limits or more. Grey bars on top = mission events. Click a cell to jump there.</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------- joint T² chart

function JointChart({ analysis, day, onPickDay }: { analysis: MissionAnalysis; day: number; onPickDay: (d: number) => void }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(640)
  const H = 200
  const m = { l: 40, r: 10, t: 10, b: 22 }
  const days = analysis.dataset.totalDays
  const ratio = analysis.joint.map((j) => (j && j.limit > 0 ? j.t2 / j.limit : null))
  const maxR = Math.max(2, ...ratio.map((r) => r ?? 0))
  const yMax = Math.min(10, Math.ceil(maxR))
  const x = (d: number) => m.l + ((d - 1) / Math.max(1, days - 1)) * (width - m.l - m.r)
  const y = (v: number) => m.t + (1 - Math.min(v, yMax) / yMax) * (H - m.t - m.b)
  const [hover, setHover] = useState<number | null>(null)
  let path = ''
  ratio.forEach((r, i) => {
    if (r === null) return
    path += `${path && ratio[i - 1] !== null ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(r).toFixed(1)}`
  })
  const exceedDays = analysis.joint.filter((j) => j?.exceeds).length
  const hj = hover ? analysis.joint[hover - 1] : null
  const label = (id: string) => analysis.timelineOf(id).def.shortLabel || id

  return (
    <div ref={wrap} className="relative">
      <svg
        width={width}
        height={H}
        className="block cursor-crosshair"
        role="img"
        aria-label="Joint T-squared statistic relative to its control limit"
        onPointerMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect()
          const d = Math.round(((e.clientX - b.left - m.l) / (width - m.l - m.r)) * (days - 1)) + 1
          setHover(Math.min(days, Math.max(1, d)))
        }}
        onPointerLeave={() => setHover(null)}
        onClick={() => hover && onPickDay(hover)}
      >
        {analysis.patternEpisodes.map((p) => (
          <rect key={p.id} x={x(p.startDay)} y={m.t} width={Math.max(2, x(p.endDay) - x(p.startDay))} height={H - m.t - m.b} fill="var(--warn)" opacity={0.12} />
        ))}
        {[0, 1, Math.round(yMax / 2), yMax].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={m.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">
              {v}×
            </text>
          </g>
        ))}
        <line x1={m.l} x2={width - m.r} y1={y(1)} y2={y(1)} stroke="var(--danger)" strokeDasharray="4 3" />
        <text x={width - m.r} y={y(1) - 4} textAnchor="end" fontSize={10} fill="var(--muted)">
          control limit
        </text>
        <path d={path} fill="none" stroke="var(--text-strong)" strokeWidth={2} strokeLinejoin="round" />
        {analysis.joint.map((j, i) => (j?.exceeds ? <circle key={i} cx={x(i + 1)} cy={y(ratio[i]!)} r={2.2} fill="var(--danger)" /> : null))}
        <line x1={x(day)} x2={x(day)} y1={m.t} y2={H - m.b} stroke="var(--accent)" strokeWidth={1.5} />
        {hover && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke="var(--muted)" strokeDasharray="2 2" />}
        {[1, Math.round(days / 2), days].map((d) => (
          <text key={d} x={x(d)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
            day {d}
          </text>
        ))}
      </svg>
      {hover && (
        <Tip x={x(hover)} y={20}>
          <p className="text-text-strong">Day {hover}</p>
          {hj ? (
            <>
              <p className="mono">
                T² {hj.t2.toFixed(1)} · limit {hj.limit.toFixed(1)} ({(hj.t2 / hj.limit).toFixed(2)}×)
              </p>
              <p className="text-muted">{hj.exceeds ? 'Above the limit: the indicators together depart from baseline.' : 'Within the limit.'}</p>
              {hj.members.length > 0 && <p>Contributing: {hj.members.map(label).join(', ')}</p>}
            </>
          ) : (
            <p className="text-muted">Not enough baseline data yet.</p>
          )}
        </Tip>
      )}
      <p className="mt-2 text-[10.5px] leading-snug text-muted">
        One number for all indicators together: a multivariate EWMA (Hotelling-type T²) divided by its control limit. Above 1× on {exceedDays} day{exceedDays === 1 ? '' : 's'}; amber bands are the combined patterns the engine raised. Several small shifts that are each within their own limit can add up to a joint departure here first.
      </p>
    </div>
  )
}

// ------------------------------------------------------- relationship matrix

function RelationshipMatrix({ analysis, day, onPick }: { analysis: MissionAnalysis; day: number; onPick: (a: string, b: string) => void }) {
  const ids = useMemo(() => analysis.timelines.filter((t) => t.def.role !== 'context').map((t) => t.def.id), [analysis])
  const rels = useMemo(() => analysis.relationshipsAt(day), [analysis, day])
  const byPair = useMemo(() => {
    const m = new Map<string, RelationshipResult>()
    for (const r of rels) {
      m.set(`${r.a}|${r.b}`, r)
      m.set(`${r.b}|${r.a}`, r)
    }
    return m
  }, [rels])
  const [hover, setHover] = useState<RelationshipResult | null>(null)
  const label = (id: string) => analysis.timelineOf(id).def.shortLabel || id
  const cell = 26
  const supported = rels.filter((r) => r.status === 'supported').length

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {ids.map((id) => (
                <th key={id} className="h-20 align-bottom">
                  <span className="mx-auto block w-4 origin-bottom-left translate-x-3 -rotate-60 whitespace-nowrap text-left text-[10px] font-normal text-muted">{label(id)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((a, i) => (
              <tr key={a}>
                <th className="pr-2 text-right text-[10.5px] font-normal whitespace-nowrap text-muted">{label(a)}</th>
                {ids.map((b, j) => {
                  if (i === j) return <td key={b} style={{ width: cell, height: cell }} className="bg-surface-2" />
                  const r = byPair.get(`${a}|${b}`)
                  const rho = r && r.status !== 'insufficient-data' ? r.rho : null
                  const strength = rho === null ? 0 : Math.min(1, Math.abs(rho) / 0.8)
                  const on = r?.status === 'supported'
                  return (
                    <td key={b} style={{ width: cell, height: cell, padding: 0 }}>
                      <button
                        onMouseEnter={() => setHover(r ?? null)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(r ?? null)}
                        onClick={() => onPick(a, b)}
                        aria-label={`${label(a)} and ${label(b)}: ${rho === null ? 'not enough data' : `rho ${rho.toFixed(2)}, ${r!.status.replace('-', ' ')}`}`}
                        className="relative block h-full w-full bg-surface-3"
                        style={{ outline: on ? '2px solid var(--text-strong)' : undefined, outlineOffset: -2 }}
                      >
                        {rho !== null && <span className="absolute inset-0" style={{ background: rho > 0 ? WARM : COOL, opacity: strength }} />}
                        {on && <span className="absolute inset-0 grid place-items-center text-[9px] font-semibold text-text-strong">{r!.lagDays ? `${r!.lagDays}d` : '●'}</span>}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 min-h-8 text-[11px] leading-snug text-text">
        {hover ? (
          <>
            <span className="text-text-strong">
              {label(hover.leader)} → {label(hover.follower)}
            </span>
            : ρ {hover.rho.toFixed(2)} at {hover.lagDays} day{hover.lagDays === 1 ? '' : 's'} lag, q {hover.qValue.toFixed(3)}, {hover.nPairs} paired days — {hover.status.replace('-', ' ')}. {hover.reason}
          </>
        ) : (
          <span className="text-muted">Hover a cell for the statistics; click it to draw the line on the visor.</span>
        )}
      </p>
      <p className="mt-1 text-[10.5px] leading-snug text-muted">
        Day {day}: lagged Spearman correlation of each pair's deviations from baseline (red = move together, blue = opposite). Outlined cells ({supported}) pass the engine's test after correction for testing many pairs and lags; the number is the lag in days. Correlation in this data is not proof of cause.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ the panel

export function DataViews({
  analysis,
  day,
  onPickDay,
  onSelect,
  onConnect,
}: {
  analysis: MissionAnalysis
  day: number
  onPickDay: (d: number) => void
  onSelect: (id: string) => void
  onConnect: (a: string, b: string) => void
}) {
  const [view, setView] = useState<View>('map')
  const tabs: { id: View; label: string }[] = [
    { id: 'map', label: 'Deviation map' },
    { id: 'joint', label: 'Joint control chart' },
    { id: 'matrix', label: 'Relationship matrix' },
  ]
  return (
    <section className="panel mt-4 rounded-md p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="eyebrow mr-2 text-text-strong">Mission data</p>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} aria-pressed={view === t.id} className={`border px-2.5 py-1 text-[11px] transition-colors ${view === t.id ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:text-text'}`}>
            {t.label}
          </button>
        ))}
        <span className="annotate ml-auto">
          {analysis.dataset.subject.name} · {analysis.timelines.length} indicators · {analysis.dataset.totalDays} days
        </span>
      </div>
      {view === 'map' && (
        <DeviationMap
          analysis={analysis}
          day={day}
          onPick={(id, d) => {
            onPickDay(d)
            onSelect(id)
          }}
        />
      )}
      {view === 'joint' && <JointChart analysis={analysis} day={day} onPickDay={onPickDay} />}
      {view === 'matrix' && <RelationshipMatrix analysis={analysis} day={day} onPick={onConnect} />}
    </section>
  )
}
