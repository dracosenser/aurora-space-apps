import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, X } from 'lucide-react'
import type { Astronaut, IndicatorKey } from '../types'
import { useMission } from '../hooks/useMission'
import { CATEGORIES, INDICATORS, indicatorsFor, formatIndicator } from '../lib/indicators'
import { mean } from '../lib/stats'
import { fmtSigned } from '../lib/format'
import { Avatar } from './ui/Misc'
import { Badge, statusTone } from './ui/Badge'
import { Button } from './ui/Button'
import { ScoreRing, Sparkline } from './charts/Sparkline'
import { AlertCard } from './AlertCard'

export function AstronautProfile({ astronaut, onClose }: { astronaut: Astronaut; onClose: () => void }) {
  const m = useMission()
  const status = m.statuses.find((s) => s.astronautId === astronaut.id)!
  const mine = m.visibleRecords.filter((r) => r.astronautId === astronaut.id)
  const last30 = mine.slice(-30)
  const last7 = mine.slice(-7)
  const prior = mine.slice(-37, -7)
  const alerts = m.alerts.filter((a) => a.astronautIds.includes(astronaut.id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const delta = (k: IndicatorKey) => mean(last7.map((r) => r[k])) - mean(prior.map((r) => r[k]))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-xl border border-border bg-bg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 flex items-start gap-4 border-b border-border bg-surface px-5 py-4">
          <Avatar astronaut={astronaut} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-strong">{astronaut.name}</h2>
              <span className="mono text-xs text-muted">{astronaut.id}</span>
              <Badge tone={statusTone(status.status)} dot>
                {status.status}
              </Badge>
            </div>
            <p className="text-sm text-muted">
              {astronaut.role} · age {astronaut.age}
            </p>
            <p className="mt-1 max-w-2xl text-xs text-text">{astronaut.background}</p>
          </div>
          <ScoreRing score={status.score} size={56} label="score" />
          <button onClick={onClose} className="rounded p-1 text-muted hover:text-text-strong" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Status drivers (trailing 7 days vs pre-flight baseline)</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {status.drivers.map((d) => (
                <li key={d} className="rounded border border-border-strong bg-surface-2 px-2 py-1 text-xs text-text">
                  {d}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="rounded-lg border border-border bg-surface p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-strong">{cat.label}</p>
                <div className="mt-3 space-y-3">
                  {indicatorsFor(cat.id).map((meta) => {
                    const vals = last30.map((r) => r[meta.key])
                    const latest = vals[vals.length - 1]
                    const d = delta(meta.key)
                    return (
                      <div key={meta.key} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-muted">{meta.shortLabel}</p>
                          <p className="mono text-sm font-semibold text-text-strong">
                            {formatIndicator(meta.key, latest)}
                            {meta.key !== 'radiationCumulative' && (
                              <span className={`ml-2 text-[10px] font-normal ${Math.abs(d) < 1e-9 ? 'text-muted' : (meta.worseWhen === 'higher' ? d > 0 : d < 0) ? 'text-warn' : 'text-ok'}`}>
                                {fmtSigned(d, meta.decimals)} 7d vs prior 30d
                              </span>
                            )}
                          </p>
                        </div>
                        <Sparkline values={vals} color={meta.color} width={80} height={24} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-text-strong">Alerts ({alerts.length})</p>
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={() => {
                  m.setSelectedAstronautId(astronaut.id)
                  m.setPage('crew-health')
                  onClose()
                }}
              >
                Open in analytics
              </Button>
            </div>
            <div className="space-y-2">
              {alerts.length === 0 && <p className="rounded border border-dashed border-border-strong px-4 py-6 text-center text-xs text-muted">No alerts recorded for this crew member up to the current view day.</p>}
              {alerts.slice(0, 6).map((a) => (
                <AlertCard key={a.id} alert={a} compact />
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted">
            {INDICATORS.restingHR.description.includes('simulated') ? '' : ''}All values are simulated demonstration data. Indicators do not independently diagnose any medical condition.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
