import { useMemo, useState } from 'react'
import { ShieldCheck, Stethoscope, Sigma } from 'lucide-react'
import type { AlertSeverity } from '../types'
import { useMission, ASTRONAUTS } from '../hooks/useMission'
import { RULE_CATALOG } from '../lib/anomaly'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Select, Segmented } from '../components/ui/Controls'
import { Disclaimer, EmptyState, Kpi } from '../components/ui/Misc'
import { AlertCard } from '../components/AlertCard'

type Status = 'active' | 'resolved' | 'all'
type Sev = AlertSeverity | 'all'

export function EarlyWarning() {
  const m = useMission()
  const [status, setStatus] = useState<Status>('all')
  const [sev, setSev] = useState<Sev>('all')
  const [who, setWho] = useState<string>('all')

  const filtered = useMemo(
    () =>
      m.alerts.filter((a) => {
        if (status === 'active' && !a.active) return false
        if (status === 'resolved' && a.active) return false
        if (sev !== 'all' && a.severity !== sev) return false
        if (who !== 'all' && !a.astronautIds.includes(who)) return false
        return true
      }),
    [m.alerts, status, sev, who],
  )

  const active = m.alerts.filter((a) => a.active)

  return (
    <div>
      <PageHeader title="Early Warning Intelligence" description="Explainable anomaly detection over every crew member's own rolling baseline. Each alert states what changed, when, which indicators are involved, why the rule fired, how confident the system is, and what to review." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active alerts" value={active.length} tone={active.some((a) => a.severity === 'caution') ? 'danger' : active.length ? 'warn' : 'ok'} sub="as of the current view day" />
        <Kpi label="Caution" value={active.filter((a) => a.severity === 'caution').length} tone="danger" sub="multi-signal or strong shifts" />
        <Kpi label="Watch" value={active.filter((a) => a.severity === 'watch').length} tone="warn" sub="single-signal deviations" />
        <Kpi label="Resolved in history" value={m.alerts.length - active.length} sub={`${m.alerts.length} total since launch`} />
      </div>

      <Card className="mt-4" flush bodyClassName="flex flex-wrap items-end gap-3 p-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Status</span>
          <Segmented value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'resolved', label: 'Resolved' }]} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Severity</span>
          <Segmented value={sev} onChange={setSev} options={[{ value: 'all', label: 'All' }, { value: 'caution', label: 'Caution' }, { value: 'watch', label: 'Watch' }, { value: 'info', label: 'Info' }]} />
        </div>
        <Select label="Crew member" value={who} onChange={setWho} options={[{ value: 'all', label: 'All crew' }, ...ASTRONAUTS.map((a) => ({ value: a.id, label: `${a.name} · ${a.id}` }))]} />
        <span className="mono ml-auto pb-2 text-xs text-muted">{filtered.length} alert(s)</span>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-2 xl:col-span-2">
          {filtered.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No alerts match these filters" body="Try widening the status or severity filter, or move the mission view day with the playback slider to see how alerts evolved." />
          ) : (
            filtered.map((a, i) => <AlertCard key={a.id} alert={a} defaultOpen={i === 0 && a.active} />)
          )}
        </div>
        <div className="space-y-4">
          <Card title={<span className="flex items-center gap-2"><Sigma className="h-3.5 w-3.5 text-accent" /> How detection works</span>}>
            <p className="text-xs leading-relaxed text-text">
              AURORA compares each crew member's last 7 days against their own 30-day baseline (with a 7-day gap so a shift does not contaminate its baseline). Rules use z-scores, variability tests, trend slopes and combinations. Alerts require the condition to persist at least two days and close after five clear days. Confidence rises with deviation size, persistence and the number of independent indicators.
            </p>
            <ul className="mt-3 space-y-2">
              {RULE_CATALOG.map((r) => (
                <li key={r.id} className="rounded border border-border bg-surface-2 px-2.5 py-2">
                  <p className="text-xs font-semibold text-text-strong">{r.name}</p>
                  <p className="mono mt-0.5 text-[10px] leading-relaxed text-muted">{r.method}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Stethoscope className="h-3.5 w-3.5 text-warn" /> Anomaly vs. diagnosis</span>}>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="font-semibold text-text-strong">An anomaly is</dt>
                <dd className="text-text">a statistically unusual change in one or more indicators relative to that person's recent history. It is objective, reproducible and explained by the numbers shown.</dd>
              </div>
              <div>
                <dt className="font-semibold text-text-strong">A diagnosis is</dt>
                <dd className="text-text">a clinical judgement made by a physician using examination, history and context. AURORA never makes one. Its role is to surface signals early so the crew and flight surgeon can decide what, if anything, to do.</dd>
              </div>
            </dl>
          </Card>
          <Disclaimer tone="warn">Simulated data. The alerts above were generated from synthetic records that include deliberately injected scenarios so the detection logic can be demonstrated.</Disclaimer>
        </div>
      </div>
    </div>
  )
}
