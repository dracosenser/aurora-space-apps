import { useMemo, useState } from 'react'
import { TrendingDown, TrendingUp, Minus, Users, User, SearchX } from 'lucide-react'
import type { IndicatorCategory, IndicatorKey } from '../types'
import { useMission, ASTRONAUTS, EVENTS } from '../hooks/useMission'
import { CATEGORIES, INDICATORS, INDICATOR_KEYS, indicatorsFor, formatIndicator } from '../lib/indicators'
import { mean, rollingMean, slope } from '../lib/stats'
import { fmtSigned } from '../lib/format'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Segmented, Select, Checkbox } from '../components/ui/Controls'
import { Disclaimer, EmptyState } from '../components/ui/Misc'
import { Badge } from '../components/ui/Badge'
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart'

type Range = '30' | '90' | '180' | 'all' | 'custom'

export function CrewHealth() {
  const m = useMission()
  const [category, setCategory] = useState<IndicatorCategory>('cardiovascular')
  const [range, setRange] = useState<Range>('90')
  const [custom, setCustom] = useState<{ from: number; to: number }>({ from: Math.max(1, m.viewDay - 59), to: m.viewDay })
  const [mode, setMode] = useState<'individual' | 'compare'>('individual')
  const [showAlerts, setShowAlerts] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [smooth, setSmooth] = useState(true)
  const [hidden, setHidden] = useState<Set<IndicatorKey>>(new Set())

  const astro = ASTRONAUTS.find((a) => a.id === m.selectedAstronautId) ?? ASTRONAUTS[0]

  const [from, to] = useMemo<[number, number]>(() => {
    if (range === 'custom') return [Math.max(1, Math.min(custom.from, custom.to)), Math.min(m.viewDay, Math.max(custom.from, custom.to))]
    if (range === 'all') return [1, m.viewDay]
    return [Math.max(1, m.viewDay - parseInt(range, 10) + 1), m.viewDay]
  }, [range, custom, m.viewDay])

  const indicators = indicatorsFor(category).filter((i) => !hidden.has(i.key))
  const inRange = useMemo(() => m.visibleRecords.filter((r) => r.day >= from && r.day <= to), [m.visibleRecords, from, to])

  const alertBands = showAlerts
    ? m.alerts
        .filter((a) => (mode === 'compare' ? a.astronautIds.length === ASTRONAUTS.length : a.astronautIds.includes(astro.id)) && a.endDay >= from && a.startDay <= to)
        .map((a) => ({ start: Math.max(from, a.startDay), end: Math.min(to, a.endDay), color: a.severity === 'caution' ? 'var(--danger)' : a.severity === 'watch' ? 'var(--warn)' : 'var(--accent-2)', indicators: a.indicators }))
    : []
  const eventMarkers = showEvents ? EVENTS.filter((e) => e.day >= from && e.day <= to && e.severity !== 'info').map((e) => ({ day: e.day, label: e.type, color: 'var(--muted)' })) : []

  const chartFor = (key: IndicatorKey) => {
    if (mode === 'compare') {
      const rows: Record<string, number>[] = []
      for (let d = from; d <= to; d++) {
        const row: Record<string, number> = { day: d }
        for (const a of ASTRONAUTS) {
          const r = inRange.find((x) => x.astronautId === a.id && x.day === d)
          if (r) row[a.id] = r[key]
        }
        rows.push(row)
      }
      return { data: rows, series: ASTRONAUTS.map((a) => ({ key: a.id, label: a.callsign, color: a.color })) }
    }
    const mine = inRange.filter((r) => r.astronautId === astro.id).sort((a, b) => a.day - b.day)
    const vals = mine.map((r) => r[key])
    const rm = rollingMean(vals, 7)
    const rows = mine.map((r, i) => ({ day: r.day, value: r[key], smooth: rm[i] }))
    const series = [{ key: 'value', label: INDICATORS[key].shortLabel, color: INDICATORS[key].color, width: smooth ? 1 : 1.75 }]
    if (smooth && key !== 'radiationCumulative') series.push({ key: 'smooth', label: '7-day mean', color: 'var(--text-strong)', width: 1.5 })
    return { data: rows, series }
  }

  const trendRows = useMemo(() => {
    const mine = inRange.filter((r) => r.astronautId === astro.id).sort((a, b) => a.day - b.day)
    return INDICATOR_KEYS.map((k) => {
      const vals = mine.map((r) => r[k])
      const first = mean(vals.slice(0, 7))
      const last = mean(vals.slice(-7))
      const trend30 = slope(vals) * 30
      const base = (astro.baseline as Record<string, number>)[k]
      return { k, first, last, trend30, min: Math.min(...vals), max: Math.max(...vals), base }
    })
  }, [inRange, astro])

  return (
    <div>
      <PageHeader title="Crew Health Analytics" description="Interactive time-series for five indicator categories. Filter by date range, inspect one crew member with alert windows and events in context, or compare the whole crew." />

      <Card flush bodyClassName="flex flex-wrap items-end gap-3 p-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'individual', label: <span className="inline-flex items-center gap-1.5"><User className="h-3 w-3" /> Individual</span> },
            { value: 'compare', label: <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Compare crew</span> },
          ]}
        />
        {mode === 'individual' && <Select label="Astronaut" value={astro.id} onChange={(v) => m.setSelectedAstronautId(v)} options={ASTRONAUTS.map((a) => ({ value: a.id, label: `${a.name} · ${a.id}` }))} />}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Date range</span>
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: '30', label: '30 d' },
              { value: '90', label: '90 d' },
              { value: '180', label: '180 d' },
              { value: 'all', label: 'Mission' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        {range === 'custom' && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              From MD
              <input type="number" min={1} max={m.viewDay} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: parseInt(e.target.value || '1', 10) }))} className="mono h-9 w-24 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-text-strong outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              To MD
              <input type="number" min={1} max={m.viewDay} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: parseInt(e.target.value || '1', 10) }))} className="mono h-9 w-24 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-text-strong outline-none focus:border-accent" />
            </label>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-4 pb-1.5">
          <Checkbox checked={showAlerts} onChange={setShowAlerts} label="Alert windows" />
          <Checkbox checked={showEvents} onChange={setShowEvents} label="Mission events" />
          {mode === 'individual' && <Checkbox checked={smooth} onChange={setSmooth} label="7-day mean" />}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={`rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${category === c.id ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-surface text-text hover:border-border-strong'}`}>
            <span className="font-semibold">{c.label}</span>
            <span className="ml-2 hidden text-muted sm:inline">{c.blurb}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted">Indicators:</span>
        {indicatorsFor(category).map((i) => (
          <Checkbox
            key={i.key}
            checked={!hidden.has(i.key)}
            color={i.color}
            onChange={(v) =>
              setHidden((h) => {
                const n = new Set(h)
                if (v) n.delete(i.key)
                else n.add(i.key)
                return n
              })
            }
            label={i.shortLabel}
          />
        ))}
        <span className="mono ml-auto text-muted">
          MD {from}–{to} · {to - from + 1} days · {inRange.length} records
        </span>
      </div>

      {inRange.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={SearchX} title="No records in this range" body="Adjust the date range or move the mission view day forward in the top bar." />
        </div>
      ) : indicators.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={SearchX} title="All indicators hidden" body="Re-enable at least one indicator above to draw charts." />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {indicators.map((meta) => {
            const { data, series } = chartFor(meta.key)
            const mine = mode === 'individual' ? inRange.filter((r) => r.astronautId === astro.id) : inRange
            const vals = mine.map((r) => r[meta.key])
            const last7 = mean(mine.filter((r) => r.day > to - 7).map((r) => r[meta.key]))
            const trend = slope(mode === 'individual' ? vals : ASTRONAUTS.map(() => 0).length ? crewMeanSeries(inRange, meta.key) : vals) * 30
            const bands = alertBands.filter((b) => b.indicators.includes(meta.key))
            return (
              <Card
                key={meta.key}
                title={meta.label}
                subtitle={meta.description}
                action={
                  <div className="text-right">
                    <p className="mono text-sm font-semibold text-text-strong">{formatIndicator(meta.key, last7)}</p>
                    <p className="text-[10px] text-muted">7-day mean{mode === 'compare' ? ' (crew)' : ''}</p>
                  </div>
                }
              >
                <TimeSeriesChart data={data} series={series} unit={meta.unit} decimals={meta.decimals} height={200} bands={bands} markers={eventMarkers} legend={mode === 'compare'} />
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                  <span>
                    Range: <span className="mono text-text">{Math.min(...vals).toFixed(meta.decimals)}–{Math.max(...vals).toFixed(meta.decimals)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Trend: <TrendIcon v={trend} meta={meta} />
                    <span className="mono text-text">
                      {fmtSigned(trend, meta.decimals)} {meta.unit}/30 d
                    </span>
                  </span>
                  {bands.length > 0 && <Badge tone="warn">{bands.length} alert window{bands.length > 1 ? 's' : ''}</Badge>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {mode === 'individual' && inRange.length > 0 && (
        <Card className="mt-5" title={`Historical trend analysis · ${astro.name}`} subtitle={`All indicators across MD ${from}–${to}. First-week vs last-week means and linear trend per 30 days.`} flush bodyClassName="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Indicator</th>
                <th className="px-3 py-2 font-medium">Pre-flight</th>
                <th className="px-3 py-2 font-medium">First week</th>
                <th className="px-3 py-2 font-medium">Last week</th>
                <th className="px-3 py-2 font-medium">Change</th>
                <th className="px-3 py-2 font-medium">Trend / 30 d</th>
                <th className="px-3 py-2 font-medium">Min–max</th>
                <th className="px-3 py-2 font-medium">Direction</th>
              </tr>
            </thead>
            <tbody className="mono">
              {trendRows.map((r) => {
                const meta = INDICATORS[r.k]
                const change = r.last - r.first
                const worse = meta.worseWhen === 'higher' ? change > 0 : meta.worseWhen === 'lower' ? change < 0 : false
                const notable = Math.abs(change) > Math.abs(r.first) * 0.05
                return (
                  <tr key={r.k} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-1.5 font-sans text-text-strong">
                      <span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: meta.color }} />
                      {meta.label}
                    </td>
                    <td className="px-3 py-1.5 text-muted">{r.base !== undefined ? formatIndicator(r.k, r.base) : '—'}</td>
                    <td className="px-3 py-1.5">{formatIndicator(r.k, r.first)}</td>
                    <td className="px-3 py-1.5">{formatIndicator(r.k, r.last)}</td>
                    <td className={`px-3 py-1.5 ${notable ? (worse ? 'text-warn' : 'text-ok') : 'text-muted'}`}>{fmtSigned(change, meta.decimals)}</td>
                    <td className="px-3 py-1.5">{fmtSigned(r.trend30, meta.decimals)}</td>
                    <td className="px-3 py-1.5 text-muted">
                      {r.min.toFixed(meta.decimals)}–{r.max.toFixed(meta.decimals)}
                    </td>
                    <td className="px-3 py-1.5 font-sans">{r.k === 'radiationCumulative' ? <Badge tone="neutral">accumulating</Badge> : notable ? <Badge tone={worse ? 'warn' : 'ok'}>{worse ? 'concerning' : 'improving'}</Badge> : <Badge tone="neutral">stable</Badge>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Disclaimer className="mt-5">
        Indicators are simulated and shown for demonstration. Trends describe statistical change relative to each crew member's own history; no indicator here independently diagnoses a medical condition. Clinical interpretation belongs to the flight surgeon.
      </Disclaimer>
    </div>
  )
}

function crewMeanSeries(records: { day: number; astronautId: string }[] & Record<string, any>[], key: IndicatorKey): number[] {
  const byDay = new Map<number, number[]>()
  for (const r of records) {
    const arr = byDay.get(r.day) ?? []
    arr.push((r as Record<string, number>)[key])
    byDay.set(r.day, arr)
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => mean(v))
}

function TrendIcon({ v, meta }: { v: number; meta: { worseWhen: 'higher' | 'lower' | 'either'; decimals: number } }) {
  const tiny = Math.abs(v) < Math.pow(10, -meta.decimals) * 2
  if (tiny) return <Minus className="h-3 w-3 text-muted" />
  const worse = meta.worseWhen === 'higher' ? v > 0 : meta.worseWhen === 'lower' ? v < 0 : false
  return v > 0 ? <TrendingUp className={`h-3 w-3 ${worse ? 'text-warn' : 'text-ok'}`} /> : <TrendingDown className={`h-3 w-3 ${worse ? 'text-warn' : 'text-ok'}`} />
}
