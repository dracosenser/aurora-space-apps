import { useMemo, useState } from 'react'
import { ArrowRight, Clock, Radiation, ShieldAlert, Users } from 'lucide-react'
import type { IndicatorKey } from '../types'
import { useMission, ASTRONAUTS, EVENTS, MISSION } from '../hooks/useMission'
import { phaseForDay } from '../data/mission'
import { INDICATORS } from '../lib/indicators'
import { mean } from '../lib/stats'
import { fmtDate, fmtElapsed } from '../lib/format'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge, severityTone } from '../components/ui/Badge'
import { Segmented } from '../components/ui/Controls'
import { Disclaimer, Kpi } from '../components/ui/Misc'
import { ScoreRing } from '../components/charts/Sparkline'
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart'
import { AstronautCard } from '../components/AstronautCard'
import { AstronautProfile } from '../components/AstronautProfile'
import { AlertCard } from '../components/AlertCard'
import { TimelineStrip, EVENT_ICONS } from '../components/TimelineStrip'
import { SpaceWeather } from '../components/SpaceWeather'

const TREND_OPTIONS: { value: IndicatorKey; label: string }[] = [
  { value: 'restingHR', label: 'Resting HR' },
  { value: 'sleepDuration', label: 'Sleep' },
  { value: 'exerciseMinutes', label: 'Exercise' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'radiationCumulative', label: 'Dose' },
]

export function MissionControl() {
  const m = useMission()
  const [profile, setProfile] = useState<string | null>(null)
  const [trendKey, setTrendKey] = useState<IndicatorKey>('restingHR')
  const phase = phaseForDay(m.viewDay)
  const active = m.alerts.filter((a) => a.active)
  const cautionCount = active.filter((a) => a.severity === 'caution').length
  const meanDose = mean(m.statuses.map((s) => s.latest?.radiationCumulative ?? 0))

  const trendData = useMemo(() => {
    const from = Math.max(1, m.viewDay - 89)
    const rows: Record<string, number>[] = []
    for (let d = from; d <= m.viewDay; d++) {
      const row: Record<string, number> = { day: d }
      for (const a of ASTRONAUTS) {
        const r = m.records.find((x) => x.astronautId === a.id && x.day === d)
        if (r) row[a.id] = r[trendKey]
      }
      rows.push(row)
    }
    return rows
  }, [m.records, m.viewDay, trendKey])

  const recentEvents = EVENTS.filter((e) => e.day <= m.viewDay).slice(-5).reverse()
  const nextEvent = EVENTS.find((e) => e.day > m.viewDay)
  const profileAstro = ASTRONAUTS.find((a) => a.id === profile)

  return (
    <div>
      <PageHeader
        title="Mission Control"
        description={`${MISSION.designation}. ${MISSION.description}`}
        actions={
          <Button variant="primary" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => m.setPage('early-warning')}>
            Review {active.filter((a) => a.severity !== 'info').length} active alerts
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Mission elapsed time" value={fmtElapsed(m.viewDay)} sub={<span className="mono">MD {m.viewDay} · {fmtDate(m.viewDay)}</span>} />
        <Kpi
          label="Mission phase"
          value={phase.name.split(' ')[0]}
          sub={
            <div>
              <p className="truncate">{phase.name}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded bg-border">
                <div className="h-full bg-accent-2" style={{ width: `${((m.viewDay - phase.startDay + 1) / (phase.endDay - phase.startDay + 1)) * 100}%` }} />
              </div>
            </div>
          }
        />
        <Kpi label="Crew size" value={ASTRONAUTS.length} sub={<span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {m.statuses.filter((s) => s.status === 'nominal').length} nominal · {m.statuses.filter((s) => s.status !== 'nominal').length} under review</span>} />
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <ScoreRing score={m.crew} size={56} />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Crew composite</p>
            <p className="text-xs text-text">Mean of individual status scores</p>
            <p className="text-[11px] text-muted">operational aid, not clinical</p>
          </div>
        </div>
        <Kpi label="Active alerts" value={active.length} tone={cautionCount ? 'danger' : active.length ? 'warn' : 'ok'} sub={<span className="inline-flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> {cautionCount} caution · {active.filter((a) => a.severity === 'watch').length} watch · {active.filter((a) => a.severity === 'info').length} info</span>} />
        <Kpi label="Mean cumulative dose" value={meanDose.toFixed(0)} unit="mSv" tone={meanDose > 500 ? 'warn' : 'default'} sub={<span className="inline-flex items-center gap-1"><Radiation className="h-3 w-3" /> {Math.round((meanDose / 600) * 100)}% of 600 mSv career limit</span>} />
      </div>

      {/* Crew */}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ASTRONAUTS.map((a, i) => (
          <AstronautCard key={a.id} astronaut={a} status={m.statuses.find((s) => s.astronautId === a.id)!} onOpen={() => setProfile(a.id)} index={i} />
        ))}
      </div>

      {/* Trends + alerts */}
      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Health indicator trends"
          subtitle={`Crew comparison, last 90 mission days · ${INDICATORS[trendKey].label} (${INDICATORS[trendKey].unit})`}
          action={<Segmented size="sm" value={trendKey} onChange={setTrendKey} options={TREND_OPTIONS} />}
        >
          <TimeSeriesChart
            data={trendData}
            series={ASTRONAUTS.map((a) => ({ key: a.id, label: a.callsign, color: a.color }))}
            unit={INDICATORS[trendKey].unit}
            decimals={INDICATORS[trendKey].decimals}
            height={240}
            legend
            markers={EVENTS.filter((e) => e.day > m.viewDay - 89 && e.day <= m.viewDay && e.severity !== 'info').map((e) => ({ day: e.day, label: e.type, color: e.severity === 'caution' ? 'var(--danger)' : 'var(--warn)' }))}
          />
          <Button size="sm" variant="ghost" className="mt-2" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => m.setPage('crew-health')}>
            Open full analytics
          </Button>
        </Card>
        <Card className="xl:col-span-2" title="Recent alerts" subtitle={`${active.length} active · ${m.alerts.length - active.length} resolved in history`} action={<Button size="sm" variant="ghost" onClick={() => m.setPage('early-warning')}>All</Button>} flush bodyClassName="p-3 space-y-2">
          {active.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">No active alerts. All crew indicators are within their rolling baselines.</p>}
          {active.slice(0, 4).map((a) => (
            <AlertCard key={a.id} alert={a} compact />
          ))}
        </Card>
      </div>

      {/* Timeline */}
      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Mission timeline" subtitle={`${MISSION.totalDays}-day profile · ${MISSION.phases.length} phases · ${EVENTS.length} logged and planned events`}>
          <TimelineStrip events={EVENTS} viewDay={m.viewDay} onSelectDay={m.setViewDay} />
        </Card>
        <Card className="xl:col-span-2" title="Event log" subtitle="Most recent first" flush bodyClassName="divide-y divide-border">
          {nextEvent && (
            <div className="flex items-start gap-3 px-4 py-2.5 opacity-70">
              <Clock className="mt-0.5 h-3.5 w-3.5 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-strong">Next: {nextEvent.title}</p>
                <p className="mono text-[10px] text-muted">MD {nextEvent.day} · in {nextEvent.day - m.viewDay} days</p>
              </div>
            </div>
          )}
          {recentEvents.map((e) => {
            const Icon = EVENT_ICONS[e.type]
            return (
              <div key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                <Icon className={`mt-0.5 h-3.5 w-3.5 ${e.severity === 'caution' ? 'text-danger' : e.severity === 'watch' ? 'text-warn' : 'text-accent'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-medium text-text-strong">{e.title}</p>
                    <Badge tone={severityTone(e.severity)}>{e.type}</Badge>
                  </div>
                  <p className="mono text-[10px] text-muted">
                    MD {e.day}
                    {e.endDay ? `–${e.endDay}` : ''} · {fmtDate(e.day)}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{e.description}</p>
                </div>
              </div>
            )
          })}
        </Card>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Disclaimer tone="warn">
            <strong className="text-text-strong">Simulated demonstration.</strong> The {MISSION.name} crew, their health records and all mission events are fictional and generated from a seeded model informed by published spaceflight research. Nothing here is a real NASA measurement. Indicators do not independently diagnose medical conditions.
          </Disclaimer>
        </div>
        <div className="xl:col-span-2">
          <SpaceWeather />
        </div>
      </div>

      {profileAstro && <AstronautProfile astronaut={profileAstro} onClose={() => setProfile(null)} />}
    </div>
  )
}
