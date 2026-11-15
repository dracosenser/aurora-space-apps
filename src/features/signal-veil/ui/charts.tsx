import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { MissionAnalysis } from '../../../engine/analysis'
import type { RecordedAction, RelationshipResult, ResponseIndicatorResult } from '../../../engine/types'
import { theilSen } from '../../../engine/robust'

/** Width of an element in CSS pixels, tracked with a ResizeObserver. */
export function useElementWidth<T extends HTMLElement>(initial = 320): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(120, Math.round(e.contentRect.width)))
    })
    ro.observe(el)
    setWidth(Math.max(120, Math.round(el.getBoundingClientRect().width)))
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

const AXIS = 'var(--border-strong)'
const GRID = 'var(--grid)'
const MUTED = 'var(--muted)'
const STRONG = 'var(--text-strong)'
const EMBER = 'var(--ember)'

function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag
}

// ---------------------------------------------------------------- history

export function HistoryChart({
  analysis,
  indicatorId,
  day,
  range,
  color,
  actions,
  onPickDay,
  height = 190,
}: {
  analysis: MissionAnalysis
  indicatorId: string
  day: number
  range: number | 'all'
  color: string
  actions: readonly RecordedAction[]
  onPickDay?: (day: number) => void
  height?: number
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const tl = analysis.timelineOf(indicatorId)
  const from = range === 'all' ? 1 : Math.max(1, day - range + 1)
  const m = { l: 42, r: 10, t: 10, b: 22 }
  const iw = Math.max(40, width - m.l - m.r)
  const ih = height - m.t - m.b

  const model = useMemo(() => {
    const states = tl.states.slice(from - 1, day)
    const baseline = tl.states[day - 1].baseline
    const usable = baseline && baseline.status !== 'insufficient' ? baseline : null
    let lo = Infinity
    let hi = -Infinity
    for (const s of states) {
      if (s.value !== null) {
        lo = Math.min(lo, s.value)
        hi = Math.max(hi, s.value)
      }
    }
    if (usable) {
      lo = Math.min(lo, usable.median - 2.6 * usable.scale)
      hi = Math.max(hi, usable.median + 2.6 * usable.scale)
    }
    if (!Number.isFinite(lo)) {
      lo = 0
      hi = 1
    }
    const pad = (hi - lo) * 0.07 || 1
    return { states, baseline: usable, lo: lo - pad, hi: hi + pad }
  }, [tl, from, day])

  const span = Math.max(1, day - from)
  const x = (d: number) => m.l + ((d - from) / span) * iw
  const y = (v: number) => m.t + (1 - (v - model.lo) / (model.hi - model.lo)) * ih

  const smooth = useMemo(() => {
    let d = ''
    let pen = false
    for (const s of model.states) {
      if (s.ewma === null || !s.baseline || s.value === null) continue
      const v = s.baseline.median + s.ewma * s.baseline.scale
      d += `${pen ? 'L' : 'M'}${x(s.day).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, iw, ih])

  const episodes = analysis.episodes.filter((e) => e.indicatorId === indicatorId && e.startDay <= day && e.endDay >= from)
  const events = analysis.dataset.events.filter((e) => e.day >= from && e.day <= day)
  const acts = actions.filter((a) => a.day >= from && a.day <= day)
  const yStep = niceStep(model.hi - model.lo, 3)
  const yTicks: number[] = []
  for (let v = Math.ceil(model.lo / yStep) * yStep; v <= model.hi; v += yStep) yTicks.push(v)
  const xStep = niceStep(span, Math.max(2, Math.floor(iw / 70)))
  const xTicks: number[] = []
  for (let d = Math.ceil(from / xStep) * xStep; d <= day; d += xStep) if (d >= from) xTicks.push(d)

  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onPickDay) return
    const rect = e.currentTarget.getBoundingClientRect()
    const d = Math.round(from + ((e.clientX - rect.left - m.l) / iw) * span)
    onPickDay(Math.min(analysis.dataset.totalDays, Math.max(1, d)))
  }

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${tl.def.label} from mission day ${from} to ${day}, with the personal baseline band`}
        className={onPickDay ? 'cursor-ew-resize touch-none select-none' : ''}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) pick(e)
        }}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={m.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill={MUTED} className="mono">
              {Math.abs(yStep) < 1 ? v.toFixed(1) : v.toFixed(0)}
            </text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text key={d} x={x(d)} y={height - 6} textAnchor="middle" fontSize="9.5" fill={MUTED} className="mono">
            {d}
          </text>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke={AXIS} />

        {/* Personal baseline: median with a ±2 robust SD band. */}
        {model.baseline && (
          <g>
            <rect x={m.l} width={iw} y={y(model.baseline.median + 2 * model.baseline.scale)} height={Math.max(1, y(model.baseline.median - 2 * model.baseline.scale) - y(model.baseline.median + 2 * model.baseline.scale))} fill={color} opacity={0.08} />
            <line x1={m.l} x2={m.l + iw} y1={y(model.baseline.median)} y2={y(model.baseline.median)} stroke={color} strokeDasharray="4 4" opacity={0.6} />
          </g>
        )}

        {/* Episodes where the smoothed deviation was beyond this indicator's own limit. */}
        {episodes.map((e) => {
          const a = Math.max(from, e.startDay)
          const b = Math.min(day, e.endDay)
          return <rect key={e.id} x={x(a) - 1} width={Math.max(2, x(b) - x(a) + 2)} y={m.t} height={ih} fill={EMBER} opacity={e.sustained ? 0.13 : 0.06} />
        })}

        {events.map((e) => (
          <g key={e.id}>
            <line x1={x(e.day)} x2={x(e.day)} y1={m.t + ih - 5} y2={m.t + ih + 3} stroke={MUTED} />
            <title>{`Day ${e.day}: ${e.title}`}</title>
          </g>
        ))}
        {acts.map((a) => (
          <g key={a.id}>
            <line x1={x(a.day)} x2={x(a.day)} y1={m.t} y2={m.t + ih} stroke={STRONG} strokeDasharray="2 3" opacity={0.7} />
            <path d={`M${x(a.day) - 4},${m.t} L${x(a.day) + 4},${m.t} L${x(a.day)},${m.t + 6} Z`} fill={STRONG} />
            <title>{`Day ${a.day}: recorded action, ${a.label}`}</title>
          </g>
        ))}

        {model.states.map((s) =>
          s.value !== null ? (
            <circle key={s.day} cx={x(s.day)} cy={y(s.value)} r={span > 90 ? 1.4 : 2} fill={color} opacity={0.85} />
          ) : s.rejectedToday ? (
            <text key={s.day} x={x(s.day)} y={m.t + ih - 8} textAnchor="middle" fontSize="9" fill={EMBER}>
              ×
            </text>
          ) : null,
        )}
        <path d={smooth} fill="none" stroke={STRONG} strokeWidth={1.4} opacity={0.9} />
        <line x1={x(day)} x2={x(day)} y1={m.t} y2={m.t + ih} stroke="var(--accent)" opacity={0.8} />
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} /> reading
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-px w-4 bg-text-strong" /> smoothed (EWMA)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-4" style={{ background: color, opacity: 0.2 }} /> baseline ±2 robust SD
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-4 bg-ember/25" /> beyond own limit
        </span>
        {onPickDay && <span className="ml-auto">drag to move through the mission</span>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ relationship

export function LagProfile({ result, aLabel, bLabel }: { result: RelationshipResult; aLabel: string; bLabel: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = 104
  const m = { l: 30, r: 8, t: 8, b: 30 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const lags = [...result.lags].sort((p, q) => p.lag - q.lag)
  if (lags.length === 0) return <p className="text-[11px] text-muted">No lag profile is available for this pair.</p>
  const bestLag = result.leader === result.a ? result.lagDays : -result.lagDays
  const bw = iw / lags.length
  const mid = m.t + ih / 2
  const scale = ih / 2 / 0.9
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={`Rank correlation between ${aLabel} and ${bLabel} at each lag tested`}>
        <line x1={m.l} x2={m.l + iw} y1={mid} y2={mid} stroke={AXIS} />
        {[-0.5, 0.5].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + iw} y1={mid - v * scale} y2={mid - v * scale} stroke={GRID} />
            <text x={m.l - 5} y={mid - v * scale + 3} textAnchor="end" fontSize="9" fill={MUTED} className="mono">
              {v > 0 ? '+0.5' : '−0.5'}
            </text>
          </g>
        ))}
        {lags.map((l, i) => {
          const h = Math.max(1, Math.abs(l.rho) * scale)
          const best = l.lag === bestLag && result.status === 'supported'
          return (
            <g key={l.lag}>
              <rect x={m.l + i * bw + bw * 0.2} width={bw * 0.6} y={l.rho >= 0 ? mid - h : mid} height={h} fill={best ? 'var(--accent)' : 'var(--border-strong)'} opacity={best ? 0.95 : 0.8} />
              <text x={m.l + i * bw + bw / 2} y={height - 17} textAnchor="middle" fontSize="9.5" fill={best ? STRONG : MUTED} className="mono">
                {l.lag > 0 ? `+${l.lag}` : l.lag === 0 ? '0' : `−${Math.abs(l.lag)}`}
              </text>
              <title>{`Lag ${l.lag} d: ρ = ${l.rho.toFixed(2)}, n = ${l.n}`}</title>
            </g>
          )
        })}
        <text x={m.l} y={height - 3} fontSize="9" fill={MUTED}>
          ← {bLabel} first
        </text>
        <text x={m.l + iw} y={height - 3} textAnchor="end" fontSize="9" fill={MUTED}>
          {aLabel} first →
        </text>
      </svg>
    </div>
  )
}

export function ResidualScatter({ analysis, result, leaderLabel, followerLabel }: { analysis: MissionAnalysis; result: RelationshipResult; leaderLabel: string; followerLabel: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const pairs = useMemo(() => analysis.supportingPairs(result), [analysis, result])
  const height = 170
  const m = { l: 12, r: 12, t: 10, b: 30 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  if (pairs.length < 8) return <p className="text-[11px] text-muted">Too few paired days to plot.</p>
  let mx = 0
  let my = 0
  for (const p of pairs) {
    mx = Math.max(mx, Math.abs(p.x))
    my = Math.max(my, Math.abs(p.y))
  }
  mx = mx * 1.08 || 1
  my = my * 1.08 || 1
  const x = (v: number) => m.l + ((v + mx) / (2 * mx)) * iw
  const y = (v: number) => m.t + (1 - (v + my) / (2 * my)) * ih
  // A resistant guide line through the cloud; the test itself is the rank correlation shown alongside.
  const fit = theilSen(
    pairs.map((p) => p.x),
    pairs.map((p) => p.y),
  )
  const supported = result.status === 'supported'
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={`Scatter of day-to-day deviations: ${leaderLabel} against ${followerLabel}${result.lagDays ? ` ${result.lagDays} day later` : ''}`}>
        <line x1={m.l} x2={m.l + iw} y1={y(0)} y2={y(0)} stroke={AXIS} />
        <line x1={x(0)} x2={x(0)} y1={m.t} y2={m.t + ih} stroke={AXIS} />
        {pairs.map((p) => (
          <circle key={p.day} cx={x(p.x)} cy={y(p.y)} r={2.1} fill={supported ? 'var(--accent-2)' : MUTED} opacity={0.3 + 0.55 * (p.day / result.day)}>
            <title>{`Day ${p.day}`}</title>
          </circle>
        ))}
        <line x1={x(-mx)} y1={y(fit.intercept - fit.slope * mx)} x2={x(mx)} y2={y(fit.intercept + fit.slope * mx)} stroke={supported ? STRONG : MUTED} strokeWidth={1.2} strokeDasharray={supported ? undefined : '4 4'} opacity={0.8} />
        <text x={m.l + iw} y={y(0) - 4} textAnchor="end" fontSize="9" fill={MUTED}>
          {leaderLabel} above its recent level →
        </text>
        <text x={x(0) + 4} y={m.t + 8} fontSize="9" fill={MUTED}>
          ↑ {followerLabel} above{result.lagDays ? `, ${result.lagDays} d later` : ''}
        </text>
        <text x={m.l} y={height - 6} fontSize="9" fill={MUTED} className="mono">
          {pairs.length} paired days · each point is one day · brighter = more recent
        </text>
      </svg>
    </div>
  )
}

/** Days on which each indicator was shifted from baseline, and where the two overlapped. Descriptive only. */
export function OverlapStrips({ analysis, a, b, day, aColor, bColor, aLabel, bLabel }: { analysis: MissionAnalysis; a: string; b: string; day: number; aColor: string; bColor: string; aLabel: string; bLabel: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const m = { l: 74, r: 8 }
  const iw = width - m.l - m.r
  const limit = analysis.config.limits.member
  const runs = useMemo(() => {
    const flags = (id: string) =>
      analysis
        .timelineOf(id)
        .states.slice(0, day)
        .map((s) => s.shift !== null && Math.abs(s.shift) >= limit && s.status !== 'stale' && s.status !== 'insufficient-data')
    const fa = flags(a)
    const fb = flags(b)
    const toRuns = (f: boolean[]) => {
      const out: [number, number][] = []
      let start = -1
      for (let i = 0; i <= f.length; i++) {
        if (i < f.length && f[i]) {
          if (start < 0) start = i
        } else if (start >= 0) {
          out.push([start + 1, i])
          start = -1
        }
      }
      return out
    }
    return { a: toRuns(fa), b: toRuns(fb), both: toRuns(fa.map((v, i) => v && fb[i])) }
  }, [analysis, a, b, day, limit])
  const total = analysis.dataset.totalDays
  const x = (d: number) => m.l + ((d - 1) / Math.max(1, total - 1)) * iw
  const rows: { label: string; color: string; runs: [number, number][] }[] = [
    { label: aLabel, color: aColor, runs: runs.a },
    { label: bLabel, color: bColor, runs: runs.b },
    { label: 'Both', color: EMBER, runs: runs.both },
  ]
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={66} role="img" aria-label={`Days on which ${aLabel} and ${bLabel} were shifted from baseline`}>
        {rows.map((r, i) => (
          <g key={r.label}>
            <text x={m.l - 6} y={12 + i * 17} textAnchor="end" fontSize="9.5" fill={MUTED}>
              {r.label.length > 13 ? r.label.slice(0, 12) + '…' : r.label}
            </text>
            <rect x={m.l} y={5 + i * 17} width={iw} height={10} fill="var(--surface-3)" opacity={0.6} />
            {r.runs.map(([s, e]) => (
              <rect key={s} x={x(s)} y={5 + i * 17} width={Math.max(1.5, x(e) - x(s) + iw / total)} height={10} fill={r.color} opacity={0.85} />
            ))}
          </g>
        ))}
        <line x1={x(day)} x2={x(day)} y1={2} y2={54} stroke="var(--accent)" />
        <text x={m.l} y={64} fontSize="9" fill={MUTED} className="mono">
          day 1
        </text>
        <text x={m.l + iw} y={64} textAnchor="end" fontSize="9" fill={MUTED} className="mono">
          day {total}
        </text>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------- response

export function BeforeAfterStrip({ analysis, result, actionDay, preWindow, postWindow, color }: { analysis: MissionAnalysis; result: ResponseIndicatorResult; actionDay: number; preWindow: [number, number]; postWindow: [number, number]; color: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = 58
  const m = { l: 4, r: 4, t: 6, b: 6 }
  const tl = analysis.timelineOf(result.indicatorId)
  const from = preWindow[0]
  const to = Math.max(postWindow[1], actionDay + 1)
  const pts: { d: number; v: number }[] = []
  let lo = Infinity
  let hi = -Infinity
  for (let d = from; d <= to; d++) {
    const v = tl.clean[d - 1]
    if (v !== null) {
      pts.push({ d, v })
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }
  if (result.baselineMedian !== null) {
    lo = Math.min(lo, result.baselineMedian)
    hi = Math.max(hi, result.baselineMedian)
  }
  if (!Number.isFinite(lo)) return <div ref={ref} />
  const pad = (hi - lo) * 0.12 || 1
  lo -= pad
  hi += pad
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const x = (d: number) => m.l + ((d - from) / Math.max(1, to - from)) * iw
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * ih
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={`${tl.def.label} before and after the recorded action`}>
        <rect x={x(preWindow[0])} width={Math.max(0, x(preWindow[1]) - x(preWindow[0]))} y={m.t} height={ih} fill="var(--surface-3)" opacity={0.5} />
        {result.baselineMedian !== null && <line x1={m.l} x2={m.l + iw} y1={y(result.baselineMedian)} y2={y(result.baselineMedian)} stroke={color} strokeDasharray="4 4" opacity={0.6} />}
        {result.medianPre !== null && <line x1={x(preWindow[0])} x2={x(preWindow[1])} y1={y(result.medianPre)} y2={y(result.medianPre)} stroke={MUTED} strokeWidth={1.5} />}
        {result.medianPost !== null && postWindow[1] > actionDay && <line x1={x(postWindow[0])} x2={x(postWindow[1])} y1={y(result.medianPost)} y2={y(result.medianPost)} stroke={STRONG} strokeWidth={1.5} />}
        {pts.map((p) => (
          <circle key={p.d} cx={x(p.d)} cy={y(p.v)} r={1.9} fill={p.d < actionDay ? MUTED : color} opacity={0.9} />
        ))}
        <line x1={x(actionDay)} x2={x(actionDay)} y1={m.t - 2} y2={m.t + ih + 2} stroke={STRONG} strokeDasharray="2 3" />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------- timeline

export function TimelineTrack({ analysis, day, actions, onPickDay }: { analysis: MissionAnalysis; day: number; actions: readonly RecordedAction[]; onPickDay: (day: number) => void }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(600)
  const height = 74
  const m = { l: 10, r: 10, t: 16, b: 16 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const total = analysis.dataset.totalDays
  const x = (d: number) => m.l + ((d - 1) / Math.max(1, total - 1)) * iw
  // The joint statistic relative to its limit, on a compressed scale so the limit sits at mid-height.
  const yRatio = (r: number) => m.t + ih - Math.min(1, Math.sqrt(Math.max(0, r)) / 2.2) * ih
  const limitY = yRatio(1)

  const { past, future } = useMemo(() => {
    const build = (fromDay: number, toDay: number) => {
      let d = ''
      let first = -1
      let lastDay = -1
      for (let k = fromDay; k <= toDay; k++) {
        const j = analysis.joint[k - 1]
        if (!j) continue
        if (first < 0) first = k
        lastDay = k
        d += `${d ? 'L' : 'M'}${x(k).toFixed(1)},${yRatio(j.t2 / j.limit).toFixed(1)} `
      }
      if (first < 0) return { line: '', area: '' }
      return { line: d, area: `${d}L${x(lastDay).toFixed(1)},${m.t + ih} L${x(first).toFixed(1)},${m.t + ih} Z` }
    }
    return { past: build(1, day), future: build(day, total) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, day, iw, total])

  const referenceEnd = analysis.jointModel.startDay - 1
  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const d = Math.round(1 + ((e.clientX - rect.left - m.l) / iw) * (total - 1))
    onPickDay(Math.min(total, Math.max(1, d)))
  }

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        className="cursor-ew-resize touch-none select-none"
        role="img"
        aria-label="Mission timeline with the joint statistic, logged events and recorded actions. Drag to move through the mission."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) pick(e)
        }}
      >
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="var(--surface-2)" opacity={0.6} />
        {/* Baseline window */}
        <rect x={x(1)} y={m.t} width={Math.max(0, x(referenceEnd) - x(1))} height={ih} fill="var(--accent)" opacity={0.06} />
        <text x={x(1) + 4} y={m.t + 10} fontSize="8.5" fill={MUTED} letterSpacing="0.12em">
          BASELINE WINDOW
        </text>
        {/* Joint pattern episodes, shown once the replay has reached them */}
        {analysis.patternEpisodes.map((p) =>
          p.detectedDay <= day ? (
            <rect key={p.id} x={x(p.startDay)} y={m.t} width={Math.max(2, x(Math.min(day, p.endDay)) - x(p.startDay))} height={ih} fill={EMBER} opacity={0.14}>
              <title>{`Joint pattern ${p.id}: days ${p.startDay}–${p.endDay}`}</title>
            </rect>
          ) : null,
        )}
        <path d={future.line} fill="none" stroke="var(--border-strong)" strokeWidth={1} opacity={0.7} />
        <path d={past.area} fill="var(--accent)" opacity={0.14} />
        <path d={past.line} fill="none" stroke="var(--accent-2)" strokeWidth={1.3} />
        <line x1={m.l} x2={m.l + iw} y1={limitY} y2={limitY} stroke={STRONG} strokeDasharray="3 4" opacity={0.45} />
        <text x={m.l + iw - 3} y={limitY - 3} textAnchor="end" fontSize="8.5" fill={MUTED} letterSpacing="0.1em">
          JOINT LIMIT
        </text>
        {/* Events */}
        {analysis.dataset.events.map((e) => (
          <g key={e.id} opacity={e.day <= day ? 1 : 0.4}>
            <line x1={x(e.day)} x2={x(e.endDay ?? e.day)} y1={m.t + ih + 5} y2={m.t + ih + 5} stroke={MUTED} strokeWidth={2} />
            <circle cx={x(e.day)} cy={m.t + ih + 5} r={2.4} fill={MUTED} />
            <title>{`Day ${e.day}${e.endDay ? `–${e.endDay}` : ''}: ${e.title}. ${e.description}`}</title>
          </g>
        ))}
        {/* Recorded actions */}
        {actions.map((a) => (
          <g key={a.id} opacity={a.day <= day ? 1 : 0.45}>
            <line x1={x(a.day)} x2={x(a.day)} y1={m.t} y2={m.t + ih} stroke={STRONG} strokeDasharray="2 3" opacity={0.6} />
            <path d={`M${x(a.day)},${m.t - 8} l5,5 l-5,5 l-5,-5 Z`} fill={a.provenance === 'user-entered' ? 'var(--accent)' : STRONG} />
            <title>{`Day ${a.day}: recorded action, ${a.label}`}</title>
          </g>
        ))}
        {/* Current day */}
        <line x1={x(day)} x2={x(day)} y1={m.t - 4} y2={m.t + ih + 10} stroke="var(--accent)" strokeWidth={1.5} />
        <circle cx={x(day)} cy={m.t - 4} r={3.5} fill="var(--accent)" />
      </svg>
    </div>
  )
}

/** Small inline trend, used in the data lens readout. */
export function MiniSpark({ values, color, width = 120, height = 30 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null)
  if (pts.length < 2) return <svg width={width} height={height} />
  let lo = Infinity
  let hi = -Infinity
  for (const p of pts) {
    lo = Math.min(lo, p.v)
    hi = Math.max(hi, p.v)
  }
  const span = hi - lo || 1
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${((p.i / Math.max(1, values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((p.v - lo) / span) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.3} />
    </svg>
  )
}
