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

function CustomTooltip({ active, payload, label, unit, decimals, xLabel, showDate }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border-strong px-3 py-2 text-xs shadow-xl" style={{ background: 'var(--tooltip-bg)' }}>
      <p className="mono mb-1 text-muted">
        {xLabel ? xLabel(label) : `MD ${label}`}
        {showDate && <span className="ml-2 opacity-70">{fmtDate(label)}</span>}
      </p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-text">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="mono text-text-strong">
            {typeof p.value === 'number' ? p.value.toFixed(decimals ?? 1) : '—'} {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TimeSeriesChart({ data, series, unit = '', height = 220, yDomain = ['auto', 'auto'], markers = [], bands = [], xKey = 'day', xLabel, decimals = 1, legend = false, showDate = true }: Props) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tickFormatter={(v) => (xLabel ? xLabel(v) : `${v}`)} minTickGap={32} />
          <YAxis domain={yDomain} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (typeof v === 'number' ? `${Number.isInteger(v) ? v : v.toFixed(1)}` : v)} />
          <Tooltip content={<CustomTooltip unit={unit} decimals={decimals} xLabel={xLabel} showDate={showDate} />} cursor={{ stroke: 'var(--border-strong)' }} />
          {legend && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />}
          {bands.map((b, i) => (
            <ReferenceArea key={`band-${i}`} x1={b.start} x2={b.end} fill={b.color ?? 'var(--warn)'} fillOpacity={0.08} stroke={b.color ?? 'var(--warn)'} strokeOpacity={0.25} label={b.label ? { value: b.label, position: 'insideTop', fontSize: 10, fill: 'var(--muted)' } : undefined} />
          ))}
          {markers.map((m, i) => (
            <ReferenceLine key={`marker-${i}`} x={m.day} stroke={m.color ?? 'var(--accent)'} strokeDasharray="4 3" strokeOpacity={0.6} label={m.label ? { value: m.label, position: 'top', fontSize: 10, fill: m.color ?? 'var(--accent)' } : undefined} />
          ))}
          {series.map((s) =>
            s.area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={s.width ?? 1.75} dot={false} isAnimationActive={false} connectNulls />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.width ?? 1.75} strokeDasharray={s.dashed ? '5 4' : undefined} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} connectNulls />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
