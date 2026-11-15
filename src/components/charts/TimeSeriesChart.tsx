import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { fmtDate } from '../../lib/format'

export interface SeriesDef {
  key: string
  label: string
  color: string
  dashed?: boolean
  area?: boolean
  width?: number
}

export interface Band {
  start: number
  end: number
  label?: string
  color?: string
}

interface Props {
  data: Record<string, number | null | undefined>[]
  series: SeriesDef[]
  unit?: string
  height?: number
  yDomain?: [number | 'auto', number | 'auto']
  markers?: { day: number; label?: string; color?: string }[]
  bands?: Band[]
  xKey?: string
  xLabel?: (v: number) => string
  decimals?: number
  legend?: boolean
  showDate?: boolean
}

/** A plate caption: the reading at the cursor, set like a technical annotation. */
function CustomTooltip({ active, payload, label, unit, decimals, xLabel, showDate }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-sm border border-border-strong px-3 py-2.5"
      style={{ background: 'var(--tooltip-bg)' }}
    >
      <p className="annotate mb-2 border-b border-border pb-1.5 text-muted">
        {xLabel ? xLabel(label) : `MD ${label}`}
        {showDate && <span className="ml-2 opacity-60">{fmtDate(label).toUpperCase()}</span>}
      </p>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-5 text-[11px]">
            <span className="flex items-center gap-2 text-text">
              <span className="inline-block h-[3px] w-3" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="mono text-text-strong">
              {typeof p.value === 'number' ? p.value.toFixed(decimals ?? 1) : '—'}
              {unit && <span className="ml-1 text-[9px] text-muted">{unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TimeSeriesChart({ data, series, unit = '', height = 220, yDomain = ['auto', 'auto'], markers = [], bands = [], xKey = 'day', xLabel, decimals = 1, legend = false, showDate = true }: Props) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 14, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="1 4" />
          <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tickFormatter={(v) => (xLabel ? xLabel(v) : `${v}`)} minTickGap={34} dy={4} />
          <YAxis domain={yDomain} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (typeof v === 'number' ? `${Number.isInteger(v) ? v : v.toFixed(1)}` : v)} />
          <Tooltip content={<CustomTooltip unit={unit} decimals={decimals} xLabel={xLabel} showDate={showDate} />} cursor={{ stroke: 'var(--accent)', strokeOpacity: 0.4, strokeDasharray: '3 3' }} />
          {legend && <Legend iconType="plainline" wrapperStyle={{ fontSize: 10, letterSpacing: '0.08em', paddingTop: 10 }} />}
          {bands.map((b, i) => (
            <ReferenceArea key={`band-${i}`} x1={b.start} x2={b.end} fill={b.color ?? 'var(--warn)'} fillOpacity={0.08} stroke={b.color ?? 'var(--warn)'} strokeOpacity={0.25} label={b.label ? { value: b.label, position: 'insideTop', fontSize: 10, fill: 'var(--muted)' } : undefined} />
          ))}
          {markers.map((m, i) => (
            <ReferenceLine key={`marker-${i}`} x={m.day} stroke={m.color ?? 'var(--accent)'} strokeDasharray="4 3" strokeOpacity={0.6} label={m.label ? { value: m.label, position: 'top', fontSize: 10, fill: m.color ?? 'var(--accent)' } : undefined} />
          ))}
          {series.map((s) =>
            s.area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.09} strokeWidth={s.width ?? 1.5} dot={false} isAnimationActive={false} connectNulls />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.width ?? 1.5}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 2.5, strokeWidth: 1, stroke: 'var(--bg)' }}
                isAnimationActive={false}
                connectNulls
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
