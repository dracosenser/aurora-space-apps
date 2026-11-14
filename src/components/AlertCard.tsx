import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Clock, Target, Users } from 'lucide-react'
import type { Alert } from '../types'
import { ASTRONAUTS } from '../data/astronauts'
import { INDICATORS } from '../lib/indicators'
import { fmtDate } from '../lib/format'
import { Badge, severityTone } from './ui/Badge'
import { TimeSeriesChart } from './charts/TimeSeriesChart'
import { useMission } from '../hooks/useMission'

export function AlertCard({ alert, defaultOpen = false, compact = false }: { alert: Alert; defaultOpen?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const { records } = useMission()
  const crewWide = alert.astronautIds.length === ASTRONAUTS.length
  const who = crewWide ? 'Whole crew' : alert.astronautIds.map((id) => ASTRONAUTS.find((a) => a.id === id)?.name ?? id).join(', ')
  const confPct = Math.round(alert.confidence * 100)

  const chartData = (() => {
    if (!open) return []
    const from = Math.max(1, alert.startDay - 45)
    const to = alert.endDay + 3
    const ids = crewWide ? [ASTRONAUTS[0].id] : alert.astronautIds
    const keys = alert.indicators.slice(0, 2)
    const rows: Record<string, number>[] = []
    for (let d = from; d <= to; d++) {
      const row: Record<string, number> = { day: d }
      for (const id of ids) {
        const rec = records.find((r) => r.astronautId === id && r.day === d)
        if (!rec) continue
        for (const k of keys) row[k] = rec[k]
      }
      rows.push(row)
    }
    return rows
  })()

  return (
    <div
      className={`panel rounded-md transition-colors duration-300 ${
        alert.active
          ? alert.severity === 'caution'
            ? 'border-danger/35'
            : alert.severity === 'watch'
              ? 'border-warn/30'
              : 'border-border-strong'
          : 'border-border'
      }`}
    >
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        {/* Severity is squared, like a signal lamp on a console */}
        <span
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-xs ${alert.severity === 'caution' ? 'bg-danger' : alert.severity === 'watch' ? 'bg-warn' : 'bg-accent-2'} ${alert.active && alert.severity !== 'info' ? 'pulse' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-text-strong">{alert.title}</p>
            <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
            <Badge tone={alert.active ? 'accent' : 'neutral'}>{alert.active ? 'active' : 'resolved'}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> MD {alert.startDay}
              {alert.endDay !== alert.startDay && `–${alert.endDay}`} · {fmtDate(alert.startDay)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {who}
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" /> {alert.indicators.map((k) => INDICATORS[k].shortLabel).join(', ')}
            </span>
          </div>
          {!compact && !open && <p className="mt-1.5 line-clamp-2 text-xs text-text">{alert.whatChanged}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="mono text-xs text-muted">{confPct}%</span>
          <div className="h-1 w-16 overflow-hidden rounded bg-border">
            <div className="h-full rounded bg-accent" style={{ width: `${confPct}%` }} />
          </div>
          <ChevronDown className={`mt-1 h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="grid gap-4 border-t border-border px-4 py-4 lg:grid-cols-5">
              <div className="space-y-3 text-sm lg:col-span-3">
                <Field label="What changed">{alert.whatChanged}</Field>
                <Field label="When">
                  Detected mission day {alert.startDay} ({fmtDate(alert.startDay)}); {alert.active ? 'still present as of the current view day' : `last observed day ${alert.endDay} (${fmtDate(alert.endDay)})`}. Duration {alert.endDay - alert.startDay + 1} day(s).
                </Field>
                <Field label="Indicators involved">
                  <div className="flex flex-wrap gap-1.5">
                    {alert.indicators.map((k) => (
                      <span key={k} className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 text-[11px]" style={{ color: INDICATORS[k].color }}>
                        {INDICATORS[k].label}
                      </span>
                    ))}
                  </div>
                </Field>
                <Field label="Why the system flagged it">{alert.why}</Field>
                <Field label="Detection method">
                  <span className="mono text-xs">{alert.ruleName} — {alert.method}</span>
                </Field>
                <Field label="Confidence">{alert.confidenceRationale}</Field>
                <Field label="What the crew should review">
                  <ul className="list-disc space-y-0.5 pl-4 text-xs">
                    {alert.review.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </Field>
                <p className="rounded border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted">
                  An anomaly is a statistical deviation from this crew member's own recent baseline. It is not a medical diagnosis and does not, by itself, indicate illness.
                </p>
              </div>
              <div className="lg:col-span-2">
                <p className="mb-1 eyebrow">Indicator trace around the alert</p>
                {chartData.length > 0 ? (
                  <TimeSeriesChart
                    data={chartData}
                    series={alert.indicators.slice(0, 2).map((k) => ({ key: k, label: INDICATORS[k].shortLabel, color: INDICATORS[k].color }))}
                    height={200}
                    decimals={INDICATORS[alert.indicators[0]].decimals}
                    bands={[{ start: alert.startDay, end: alert.endDay, label: 'alert window', color: alert.severity === 'caution' ? 'var(--danger)' : 'var(--warn)' }]}
                    legend
                  />
                ) : null}
                <div className="mt-2 space-y-1">
                  {alert.stats
                    .filter((s) => alert.indicators.includes(s.indicator))
                    .map((s) => (
                      <div key={s.indicator} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">{INDICATORS[s.indicator].shortLabel}</span>
                        <span className="mono text-text">
                          {s.baseline.toFixed(INDICATORS[s.indicator].decimals)} → {s.recent.toFixed(INDICATORS[s.indicator].decimals)} {INDICATORS[s.indicator].unit}
                          {s.z !== 0 && <span className="ml-2 text-muted">z {s.z.toFixed(1)}</span>}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 eyebrow">{label}</p>
      <div className="text-xs leading-relaxed text-text">{children}</div>
    </div>
  )
}
