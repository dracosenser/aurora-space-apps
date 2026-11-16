import { useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import { useElementWidth } from '../signal-veil/ui/charts'

export interface ChartSeries {
  key: string
  label: string
  color: string
  values: ArrayLike<number>
  dashed?: boolean
}

export interface ChartBand {
  start: number
  end: number
  label: string
  color?: string
}

/**
 * Lightweight SVG line chart for simulation output. Long series are reduced
 * to at most one min/max pair per pixel column, so a 1,000-day or hourly run
 * draws as fast as a short one.
 */
export function SimChart({
  series,
  height = 180,
  bands = [],
  cursor,
  onPick,
  reference,
  unit = '',
  decimals = 1,
  xLabel = 'day',
  xStart = 1,
  xStep = 1,
}: {
  series: ChartSeries[]
  height?: number
  bands?: ChartBand[]
  cursor?: number
  onPick?: (x: number) => void
  reference?: { value: number; label: string }
  unit?: string
  decimals?: number
  xLabel?: string
  xStart?: number
  xStep?: number
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(600)
  const m = { l: 44, r: 10, t: 10, b: 22 }
  const iw = Math.max(40, width - m.l - m.r)
  const ih = height - m.t - m.b
  const n = series.length ? series[0].values.length : 0
  const xMax = xStart + (n - 1) * xStep

  const model = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of series) for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i]
      if (Number.isFinite(v)) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    if (reference) {
      lo = Math.min(lo, reference.value)
      hi = Math.max(hi, reference.value)
    }
    if (!Number.isFinite(lo)) {
      lo = 0
      hi = 1
    }
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
    lo -= pad
    hi += pad
    const cols = Math.max(2, Math.floor(iw))
    const paths = series.map((s) => {
      const len = s.values.length
      let d = ''
      const yOf = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * ih
      if (len <= cols * 2) {
        for (let i = 0; i < len; i++) d += `${i ? 'L' : 'M'}${(m.l + (i / Math.max(1, len - 1)) * iw).toFixed(1)},${yOf(s.values[i]).toFixed(1)}`
      } else {
        // Min/max decimation per pixel column keeps peaks visible.
        for (let c = 0; c < cols; c++) {
          const a = Math.floor((c / cols) * len)
          const b = Math.max(a + 1, Math.floor(((c + 1) / cols) * len))
          let mn = Infinity
          let mx = -Infinity
          for (let i = a; i < b; i++) {
            const v = s.values[i]
            if (v < mn) mn = v
            if (v > mx) mx = v
          }
          const x = (m.l + (c / (cols - 1)) * iw).toFixed(1)
          d += `${c ? 'L' : 'M'}${x},${yOf(mn).toFixed(1)}L${x},${yOf(mx).toFixed(1)}`
        }
      }
      return d
    })
    return { lo, hi, paths }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, iw, ih, reference?.value])

  const x = (v: number) => m.l + ((v - xStart) / Math.max(1e-9, xMax - xStart)) * iw
  const y = (v: number) => m.t + (1 - (v - model.lo) / (model.hi - model.lo)) * ih
  const ticks = 4
  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onPick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const v = xStart + ((e.clientX - rect.left - m.l) / iw) * (xMax - xStart)
    onPick(Math.round(Math.min(xMax, Math.max(xStart, v))))
  }

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        className={onPick ? 'cursor-ew-resize touch-none select-none' : ''}
        onPointerDown={(e) => {
          if (!onPick) return
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => e.buttons & 1 && pick(e)}
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
      >
        {Array.from({ length: ticks + 1 }, (_, k) => model.lo + ((model.hi - model.lo) * k) / ticks).map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={m.l - 5} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)" className="mono">
              {v.toFixed(decimals)}
            </text>
          </g>
        ))}
        {bands.map((b, i) => (
          <rect key={i} x={x(b.start)} width={Math.max(1.5, x(b.end + xStep) - x(b.start))} y={m.t} height={ih} fill={b.color ?? 'var(--ember)'} opacity={0.1}>
            <title>{b.label}</title>
          </rect>
        ))}
        {reference && (
          <g>
            <line x1={m.l} x2={m.l + iw} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--text-strong)" strokeDasharray="4 4" opacity={0.45} />
            <text x={m.l + 4} y={y(reference.value) - 3} fontSize="9" fill="var(--muted)">
              {reference.label}
            </text>
          </g>
        )}
        {model.paths.map((d, i) => (
          <path key={series[i].key} d={d} fill="none" stroke={series[i].color} strokeWidth={1.4} strokeDasharray={series[i].dashed ? '5 4' : undefined} />
        ))}
        {cursor !== undefined && <line x1={x(cursor)} x2={x(cursor)} y1={m.t} y2={m.t + ih} stroke="var(--accent)" />}
        <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="var(--border-strong)" />
        {[xStart, Math.round((xStart + xMax) / 2), xMax].map((v, i) => (
          <text key={i} x={x(v)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="9.5" fill="var(--muted)" className="mono">
            {xLabel} {v}
          </text>
        ))}
      </svg>
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }} />
              {s.label}
            </span>
          ))}
          {unit && <span className="ml-auto">{unit}</span>}
        </div>
      )}
    </div>
  )
}
