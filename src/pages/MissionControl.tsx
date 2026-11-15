import { useMemo, useState } from 'react'
import { ArrowRight, Radiation, ShieldAlert, Users } from 'lucide-react'
import type { IndicatorKey } from '../types'
import { useMission, ASTRONAUTS, EVENTS, MISSION } from '../hooks/useMission'
import { phaseForDay } from '../data/mission'
import { INDICATORS } from '../lib/indicators'
import { mean } from '../lib/stats'
import { fmtDate, fmtElapsed } from '../lib/format'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Controls'
import { Disclaimer, Kpi, RuledHeading } from '../components/ui/Misc'
import { ScoreRing } from '../components/charts/Sparkline'
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart'
import { AstronautCard } from '../components/AstronautCard'
import { AstronautProfile } from '../components/AstronautProfile'
import { AlertCard } from '../components/AlertCard'
import { SpaceWeather } from '../components/SpaceWeather'
import { MissionHero } from '../components/MissionHero'
import { ARCHIVE, ARCHIVE_LIST } from '../data/archive'
import { ArchivePhoto } from '../components/visual/ArchivePhoto'
import { ContactSheet } from '../components/visual/ContactSheet'
import { PlottingChart } from '../components/visual/PlottingChart'
import { Coordinates } from '../components/visual/Celestial'

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
      {/* The masthead carries the mission's identity; the instruments follow */}
      <MissionHero />

      {/* ------------------------------------------------------ status board */}
      <section className="mb-10">
        <RuledHeading note={`AS OF MD ${m.viewDay}`}>Mission status</RuledHeading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Mission elapsed" value={fmtElapsed(m.viewDay)} sub={<span className="mono">MD {m.viewDay} · {fmtDate(m.viewDay)}</span>} />
          <Kpi
            label="Mission phase"
            value={phase.name.split(' ')[0]}
            sub={
              <div>
                <p className="truncate">{phase.name}</p>
                <div className="mt-2 h-px bg-border">
                  <div className="h-px bg-accent-2" style={{ width: `${((m.viewDay - phase.startDay + 1) / (phase.endDay - phase.startDay + 1)) * 100}%` }} />
                </div>
              </div>
            }
          />
          <Kpi
            label="Crew size"
            value={ASTRONAUTS.length}
            sub={
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3 w-3" /> {m.statuses.filter((s) => s.status === 'nominal').length} nominal · {m.statuses.filter((s) => s.status !== 'nominal').length} under review
              </span>
            }
          />
          <div className="panel flex items-center gap-3.5 rounded-md p-4">
            <ScoreRing score={m.crew} size={54} />
            <div className="min-w-0">
              <p className="eyebrow-sm">Crew composite</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">Mean of individual status scores.</p>
            </div>
          </div>
          <Kpi
            label="Active alerts"
            value={active.length}
            tone={cautionCount ? 'danger' : active.length ? 'warn' : 'ok'}
            sub={
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="h-3 w-3" /> {cautionCount} caution · {active.filter((a) => a.severity === 'watch').length} watch · {active.filter((a) => a.severity === 'info').length} info
              </span>
            }
          />
          <Kpi
            label="Mean cumulative dose"
            value={meanDose.toFixed(0)}
            unit="mSv"
            tone={meanDose > 500 ? 'warn' : 'default'}
            sub={
              <span className="inline-flex items-center gap-1.5">
                <Radiation className="h-3 w-3" /> {Math.round((meanDose / 600) * 100)}% of 600 mSv career limit
              </span>
            }
          />
        </div>
      </section>

      {/* ------------------------------------------------------------- crew */}
      <section className="mb-10">
        <RuledHeading note={`${ASTRONAUTS.length} PERSONNEL FILES`}>Crew</RuledHeading>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ASTRONAUTS.map((a, i) => (
            <AstronautCard key={a.id} astronaut={a} status={m.statuses.find((s) => s.astronautId === a.id)!} onOpen={() => setProfile(a.id)} index={i} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ field record */}
      <section className="mb-14">
        <RuledHeading note="NASA PUBLIC DOMAIN · CONTACT SHEET">Field record</RuledHeading>

        <div className="mb-9 grid gap-x-8 gap-y-8 lg:grid-cols-12">
          <ArchivePhoto
            className="lg:col-span-7"
            frame={ARCHIVE['lunar-survey']}
            ratio="16 / 10"
            reticles
            parallax
            screen={0.55}
          />
          <div className="lg:col-span-5 lg:pt-8">
            <p className="display-italic text-[clamp(1.2rem,2vw,1.6rem)] leading-snug text-text-strong">
              “The crew must be its own clinic — Earth is forty minutes away, and
              evacuation is years away.”
            </p>
            <p className="mt-5 text-[13px] leading-relaxed text-muted">
              AURORA reads the same signals a flight surgeon would, continuously, and
              explains every one of them. The photographic record is drawn from NASA's
              public archive; the crew telemetry beside it is synthetic and labelled as
              such on every page.
            </p>
            <Coordinates
              className="mt-7"
              rows={[
                ['SOURCE', 'NASA IMAGE & VIDEO LIBRARY'],
                ['RIGHTS', 'PUBLIC DOMAIN · NOT NASA-ENDORSED'],
                ['TREATMENT', 'MONOCHROME · HALFTONE SCREEN'],
              ]}
            />
          </div>
        </div>

        <ContactSheet frames={ARCHIVE_LIST.slice(1)} />
      </section>

      {/* -------------------------------------------------- trends & signals */}
      <section className="mb-10">
        <RuledHeading note="LAST 90 MISSION DAYS">Trends &amp; signals</RuledHeading>
        <div className="grid gap-4 xl:grid-cols-5">
          <Card
            className="xl:col-span-3"
            title="Health indicator trends"
            plate="FIG. 1"
            subtitle={`Crew comparison · ${INDICATORS[trendKey].label} (${INDICATORS[trendKey].unit})`}
            action={<Segmented size="sm" value={trendKey} onChange={setTrendKey} options={TREND_OPTIONS} />}
          >
            <TimeSeriesChart
              data={trendData}
              series={ASTRONAUTS.map((a) => ({ key: a.id, label: a.callsign, color: a.color }))}
              unit={INDICATORS[trendKey].unit}
              decimals={INDICATORS[trendKey].decimals}
              height={248}
              legend
              markers={EVENTS.filter((e) => e.day > m.viewDay - 89 && e.day <= m.viewDay && e.severity !== 'info').map((e) => ({
                day: e.day,
                label: e.type,
                color: e.severity === 'caution' ? 'var(--danger)' : 'var(--warn)',
              }))}
            />
            <Button size="sm" variant="ghost" className="mt-3" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => m.setPage('crew-health')}>
              Open full analytics
            </Button>
          </Card>

          <Card
            className="xl:col-span-2"
            title="Recent alerts"
            plate="LOG"
            subtitle={`${active.length} active · ${m.alerts.length - active.length} resolved in history`}
            action={
              <Button size="sm" variant="ghost" onClick={() => m.setPage('early-warning')}>
                All
              </Button>
            }
            flush
            bodyClassName="p-3 space-y-2"
          >
            {active.length === 0 && <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted">No active alerts. All crew indicators are within their rolling baselines.</p>}
            {active.slice(0, 4).map((a) => (
              <AlertCard key={a.id} alert={a} compact />
            ))}
          </Card>
        </div>
      </section>

      {/* --------------------------------------------------------- timeline */}
      <section className="mb-14">
        <RuledHeading note={`CHART AUR-002 · ${EVENTS.length} PLOTTED EVENTS`}>Mission profile</RuledHeading>
        <PlottingChart events={EVENTS} viewDay={m.viewDay} onSelectDay={m.setViewDay} />
      </section>

      {/* --------------------------------------------------------- footnotes */}
      <section className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Disclaimer tone="warn">
            <strong className="text-text-strong">Simulated demonstration.</strong> The {MISSION.name} crew, their health records and all mission events are fictional and generated from a seeded model informed by published spaceflight research. Nothing here is a real NASA measurement. Indicators do not independently diagnose medical conditions.
          </Disclaimer>
        </div>
        <div className="xl:col-span-2">
          <SpaceWeather />
        </div>
      </section>

      {profileAstro && <AstronautProfile astronaut={profileAstro} onClose={() => setProfile(null)} />}
    </div>
  )
}
