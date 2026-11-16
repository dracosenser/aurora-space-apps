import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, FlaskConical, Radio, Thermometer } from 'lucide-react'
import { useMission, ASTRONAUTS, EVENTS, MISSION } from '../../../hooks/useMission'
import { INDICATORS } from '../../../lib/indicators'
import { TimeSeriesChart } from '../../../components/charts/TimeSeriesChart'
import type { IndicatorKey } from '../../../types'
import { phaseForDay } from '../../../data/mission'
import { runScenario, DEFAULT_PARAMS, RADIATION_SCENARIOS } from '../../../lib/simulator'
import type { RadiationScenario, ScenarioParams } from '../../../types'
import { Button } from '../../../components/ui/Button'
import type { StationId } from '../model/deck'
import type { TaskId } from '../model/objectives'
import { PROCEDURES_AT } from '../model/procedures'
import { ProcedurePanel } from './ProcedurePanel'

/**
 * The console screens, as DOM over the canvas.
 *
 * These deliberately render from the same MissionProvider the rest of AURORA
 * reads. There is no second copy of the crew, the mission or the scenario
 * anywhere in this feature: change the mission day on the top bar and the
 * navigation console changes with it; change the radiation case here and the
 * Simulator page opens on that case.
 */

function Row({ label, value, tone }: { label: string; value: string; tone?: 'alert' | 'ok' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/8 py-1.5 last:border-b-0">
      <span className="mono text-[10.5px] uppercase tracking-[0.18em] text-white/40">{label}</span>
      <span className={`mono text-[12.5px] ${tone === 'alert' ? 'text-amber-300/90' : tone === 'ok' ? 'text-emerald-300/80' : 'text-white/85'}`}>{value}</span>
    </div>
  )
}

function Bar({ value, max = 1 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100
  return (
    <div className="h-1 w-full bg-white/10">
      <div className="h-full bg-cyan-300/60" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ------------------------------------------------------------- navigation
function Navigation() {
  const m = useMission()
  const phase = phaseForDay(m.viewDay)
  const progress = m.viewDay / MISSION.totalDays
  const upcoming = EVENTS.filter((e) => e.day >= m.viewDay).slice(0, 5)
  const passed = EVENTS.filter((e) => e.day < m.viewDay).length

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <Row label="Vessel" value={MISSION.designation} />
        <Row label="Destination" value={MISSION.destination} />
        <Row label="Mission day" value={`${m.viewDay} of ${MISSION.totalDays}`} />
        <Row label="Phase" value={phase?.name ?? '—'} />
        <Row label="Events logged" value={`${passed} of ${EVENTS.length}`} />
        <div className="mt-4">
          <div className="mono mb-1.5 flex justify-between text-[10.5px] uppercase tracking-[0.18em] text-white/40">
            <span>Elapsed</span>
            <span>{(progress * 100).toFixed(1)}%</span>
          </div>
          <Bar value={progress} />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-white/45">
          Mission progress is elapsed time against the planned profile. AURORA models no
          trajectory and computes no orbital state, so no distance is shown.
        </p>
      </div>
      <div>
        <p className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-white/40">Timeline ahead</p>
        <ul className="space-y-2">
          {upcoming.length === 0 && <li className="text-[12.5px] text-white/40">Nothing further on the profile.</li>}
          {upcoming.map((e) => (
            <li key={e.id} className="border-l border-white/15 pl-3">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/35">MD {e.day}</p>
              <p className="text-[13px] text-white/85">{e.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">{e.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- medical
/**
 * The medical console.
 *
 * Selecting a field opens it here, on the console itself, rather than sending
 * the visitor out of the station to a page. That was the point of walking to
 * the bay. The underlying chart and indicator definitions are the application's
 * own; the console is another surface for them, not a second copy.
 */
type MedView = 'overview' | IndicatorKey

function Medical({ onLeave, onTask }: { onLeave: (page: 'signal-veil' | 'crew-health' | 'early-warning') => void; onTask: (t: TaskId) => void }) {
  const m = useMission()
  const [view, setView] = useState<MedView>('overview')
  const a = ASTRONAUTS.find((x) => x.id === m.selectedAstronautId) ?? ASTRONAUTS[0]
  const theirs = useMemo(() => m.visibleRecords.filter((r) => r.astronautId === a.id), [m.visibleRecords, a.id])
  const rec = theirs[theirs.length - 1]
  const theirAlerts = m.alerts.filter((al) => al.active && al.astronautIds.includes(a.id))

  useEffect(() => {
    if (rec) onTask('read-vitals')
  }, [rec, onTask])
  useEffect(() => {
    if (m.log.veil.includes('foundSupported')) onTask('veil-connect')
  }, [m.log.veil, onTask])

  // The fields the console can open, each a real indicator the engine tracks.
  const FIELDS: IndicatorKey[] = ['restingHR', 'hrv', 'systolicBP', 'sleepDuration', 'sleepQuality', 'stress']

  if (view !== 'overview') {
    const meta = INDICATORS[view]
    const data = theirs.map((r) => ({ day: r.day, value: (r as unknown as Record<string, number>)[view] }))
    const recent = data.slice(-28)
    const base = data.slice(0, 30).reduce((t, d) => t + (d.value ?? 0), 0) / Math.max(1, data.slice(0, 30).length)
    const now = recent[recent.length - 1]?.value
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setView('overview')}
            className="mono flex items-center gap-1.5 border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/65 transition-colors hover:border-white/45 hover:text-white"
          >
            <ChevronLeft className="h-3 w-3" /> Back
          </button>
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">{a.name}</p>
            <p className="text-[15px] text-white/90">{meta.label}</p>
          </div>
          <span className="annotate ml-auto text-white/35">MD {m.viewDay}</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="border border-white/10 bg-black/30 p-2">
              <TimeSeriesChart
                data={data as Record<string, number | null | undefined>[]}
                series={[{ key: 'value', label: meta.shortLabel, color: 'var(--accent)', width: 1.5 }]}
                unit={meta.unit}
                height={210}
                decimals={meta.decimals}
                showDate={false}
              />
            </div>
          </div>
          <div className="lg:col-span-4">
            <Row label="Current" value={now != null ? `${now.toFixed(meta.decimals)} ${meta.unit}` : '—'} />
            <Row label="Personal baseline" value={`${base.toFixed(meta.decimals)} ${meta.unit}`} />
            <Row
              label="Change"
              value={now != null && base ? `${now > base ? '+' : ''}${(((now - base) / base) * 100).toFixed(1)}%` : '—'}
              tone={now != null && base && Math.abs((now - base) / base) > 0.08 ? 'alert' : 'ok'}
            />
            <Row label="Records" value={`${data.length}`} />
            <Row label="Category" value={meta.category} />
            <p className="mt-3 text-[11px] leading-relaxed text-white/45">{meta.description}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/40">
              Baseline is this crew member's own early-mission mean, not a population range. A
              change here is a deviation from their own history and nothing more.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <p className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-white/40">Crew member</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ASTRONAUTS.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                m.setSelectedAstronautId(x.id)
                onTask('select-crew')
              }}
              aria-pressed={x.id === a.id}
              className={`mono border px-2 py-1 text-[10.5px] uppercase tracking-wider transition-colors ${
                x.id === a.id ? 'border-cyan-300/70 text-cyan-200' : 'border-white/15 text-white/50 hover:border-white/35 hover:text-white/80'
              }`}
            >
              {x.initials}
            </button>
          ))}
        </div>
        <Row label="Name" value={a.name} />
        <Row label="Role" value={a.role} />

        <p className="mono mb-1 mt-4 text-[10.5px] uppercase tracking-[0.18em] text-white/40">
          Measurements — select one to open it
        </p>
        <div className="grid gap-px bg-white/10">
          {FIELDS.map((k) => {
            const meta = INDICATORS[k]
            const v = rec ? (rec as unknown as Record<string, number>)[k] : undefined
            return (
              <button
                key={k}
                onClick={() => {
                  setView(k)
                  onTask('read-trends')
                }}
                className="flex items-center justify-between gap-3 bg-neutral-950 px-2.5 py-2 text-left transition-colors hover:bg-neutral-900"
              >
                <span className="mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">{meta.shortLabel}</span>
                <span className="mono text-[12.5px] text-white/85">
                  {v != null ? `${v.toFixed(meta.decimals)} ${meta.unit}` : '—'}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Row
          label="Open anomalies"
          value={theirAlerts.length ? `${theirAlerts.length}` : 'None'}
          tone={theirAlerts.length ? 'alert' : 'ok'}
        />
        {theirAlerts.length > 0 && (
          <>
            <p className="mono mb-2 mt-3 text-[10.5px] uppercase tracking-[0.18em] text-amber-300/70">Flagged for review</p>
            <ul className="mb-4 space-y-2">
              {theirAlerts.slice(0, 3).map((al) => (
                <li
                  key={al.id}
                  onClick={() => onTask('open-alert')}
                  className="cursor-pointer border-l border-amber-300/40 pl-3 transition-colors hover:border-amber-300/80"
                >
                  <p className="text-[13px] text-white/85">{al.title}</p>
                  <p className="mono mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/35">
                    {al.ruleName} · from MD {al.startDay}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mb-3 text-[12px] leading-relaxed text-white/45">
          The visor runs on {a.name.split(' ')[0]}'s own record. It opens as a full page because
          it needs the whole screen to work.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              onTask('open-veil')
              onLeave('signal-veil')
            }}
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          >
            Open Signal Veil
          </Button>
          <Button variant="outline" onClick={() => onLeave('early-warning')}>
            Early warning
          </Button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- crew
function Crew({ onTask }: { onTask: (t: TaskId) => void }) {
  const m = useMission()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ASTRONAUTS.map((a) => {
        const rec = [...m.visibleRecords].reverse().find((r) => r.astronautId === a.id)
        const open = m.alerts.filter((al) => al.active && al.astronautIds.includes(a.id)).length
        return (
          <button
            key={a.id}
            onClick={() => {
              m.setSelectedAstronautId(a.id)
              onTask('read-sleep')
            }}
            className={`border p-3 text-left transition-colors ${
              a.id === m.selectedAstronautId ? 'border-cyan-300/50' : 'border-white/12 hover:border-white/30'
            }`}
          >
            <div className="flex items-baseline justify-between">
              <p className="text-[13.5px] text-white/90">{a.name}</p>
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/35">{a.initials}</span>
            </div>
            <p className="mono mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/35">{a.role}</p>
            <dl className="mono mt-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <dt className="text-white/40">Sleep</dt>
                <dd className="text-white/80">{rec ? `${rec.sleepDuration.toFixed(1)} h` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/40">Resting HR</dt>
                <dd className="text-white/80">{rec ? `${rec.restingHR.toFixed(0)} bpm` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/40">Open items</dt>
                <dd className={open ? 'text-amber-300/90' : 'text-emerald-300/70'}>{open || 'none'}</dd>
              </div>
            </dl>
          </button>
        )
      })}
      <p className="sm:col-span-2 text-[12px] leading-relaxed text-white/45">
        Selecting a crew member here selects them everywhere — the medical bay, Signal Veil
        and the crew pages all follow.
      </p>
    </div>
  )
}

// ------------------------------------------------------------ environment
/**
 * Cabin conditions are shown as held values, because AURORA models no life
 * support. The controls that follow are the real Mission Scenario Simulator,
 * so changing them changes the model the rest of the application runs on.
 */
function Environment({ onLeave, onTask }: { onLeave: (page: 'simulator') => void; onTask: (t: TaskId) => void }) {
  const m = useMission()
  const [params, setParams] = useState<ScenarioParams>(m.lastScenario ?? DEFAULT_PARAMS)
  const result = useMemo(() => runScenario(params), [params])
  const base = useMemo(() => runScenario(DEFAULT_PARAMS), [])
  const set = (patch: Partial<ScenarioParams>) => {
    const next = { ...params, ...patch }
    setParams(next)
    m.setLastScenario(next)
    onTask('change-scenario')
  }
  const delta = (a: number, b: number) => {
    const d = a - b
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <p className="mono mb-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/40">
          <Thermometer className="h-3 w-3" /> Cabin — held at set point
        </p>
        <Row label="Temperature" value="22.4 °C" />
        <Row label="Pressure" value="101.3 kPa" />
        <Row label="Oxygen partial pressure" value="21.2 kPa" />
        <Row label="Carbon dioxide" value="0.4 kPa" />
        <Row label="Relative humidity" value="44 %" />
        <Row label="Artificial gravity" value="Not fitted" />
        <p className="mt-3 text-[11.5px] leading-relaxed text-white/40">
          These are fixed nominal values shown for context. AURORA has no life-support model,
          so they are not simulated and cannot be changed — inventing a control that did
          nothing would be worse than showing none. The parameter set follows NASA-STD-3001
          Volume 2; see docs/NASA_DATA.md.
        </p>
      </div>

      <div>
        <p className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-cyan-200/70">
          Mission scenario — live model
        </p>
        <label className="mono mb-3 block text-[10.5px] uppercase tracking-[0.18em] text-white/40">
          Radiation case
          <select
            value={params.radiationScenario}
            onChange={(e) => set({ radiationScenario: e.target.value as RadiationScenario })}
            className="mono mt-1 w-full border border-white/20 bg-black/40 px-2 py-1.5 text-[12px] normal-case tracking-normal text-white/85"
          >
            {Object.entries(RADIATION_SCENARIOS).map(([k, v]) => (
              <option key={k} value={k} className="bg-neutral-900">
                {v.label}
              </option>
            ))}
          </select>
        </label>

        {([
          ['Sleep disruption', 'sleepDisruption', 0, 100, 5, '%'],
          ['Exercise sessions', 'exerciseSessionsPerWeek', 0, 7, 1, '/wk'],
          ['Stress level', 'stressLevel', 1, 10, 1, '/10'],
        ] as const).map(([label, key, min, max, step, unit]) => (
          <label key={key} className="mono mb-3 block text-[10.5px] uppercase tracking-[0.18em] text-white/40">
            <span className="flex justify-between">
              {label}
              <span className="text-white/80">
                {params[key]}
                {unit}
              </span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={params[key]}
              onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<ScenarioParams>)}
              className="mt-1 w-full accent-cyan-300"
            />
          </label>
        ))}

        <div className="mt-4 border-t border-white/12 pt-3">
          <p className="mono mb-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/40">
            Modelled at day {result.final.day} · change vs nominal
          </p>
          <Row label="Readiness" value={`${result.final.readiness.toFixed(0)} (${delta(result.final.readiness, base.final.readiness)})`} />
          <Row label="Muscle strength" value={`${result.final.muscleStrength.toFixed(0)}% (${delta(result.final.muscleStrength, base.final.muscleStrength)})`} />
          <Row label="Sleep quality" value={`${result.final.sleepQuality.toFixed(0)} (${delta(result.final.sleepQuality, base.final.sleepQuality)})`} />
          <Row
            label="Cumulative dose"
            value={`${result.final.radiationCumulative.toFixed(0)} mSv`}
            tone={result.final.radiationCumulative > 600 ? 'alert' : undefined}
          />
        </div>
        <Button className="mt-3" variant="outline" onClick={() => onLeave('simulator')} icon={<ArrowUpRight className="h-3.5 w-3.5" />}>
          Open the full simulator
        </Button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- comms
/**
 * Traffic is derived from the mission's own events and alerts rather than
 * invented, and one-way light time is computed from the mission profile's
 * stated distance rather than from any trajectory AURORA does not model.
 */
function Comms() {
  const m = useMission()
  const [sent, setSent] = useState<string[]>([])
  const phase = phaseForDay(m.viewDay)

  // Rough one-way light time across the profile. Stated as approximate because
  // it is interpolated from the mission phase, not from an ephemeris.
  const owlt = useMemo(() => {
    const f = m.viewDay / MISSION.totalDays
    const minutes = 3 + 19 * Math.sin(Math.min(1, f) * Math.PI) ** 0.7
    return minutes
  }, [m.viewDay])

  const traffic = useMemo(() => {
    const fromEvents = EVENTS.filter((e) => e.day <= m.viewDay)
      .slice(-5)
      .map((e) => ({ day: e.day, from: 'MISSION CONTROL', text: e.title, tone: e.severity }))
    const fromAlerts = m.alerts
      .filter((a) => a.active)
      .slice(0, 3)
      .map((a) => ({ day: a.startDay, from: 'AURORA ONBOARD', text: a.title, tone: 'watch' as const }))
    return [...fromEvents, ...fromAlerts].sort((a, b) => b.day - a.day)
  }, [m.viewDay, m.alerts])

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <Row label="Link" value={owlt > 14 ? 'Store and forward' : 'Near real time'} />
        <Row label="One-way light time" value={`≈ ${owlt.toFixed(1)} min`} />
        <Row label="Round trip" value={`≈ ${(owlt * 2).toFixed(1)} min`} />
        <Row label="Phase" value={phase?.name ?? '—'} />
        <p className="mt-3 text-[11.5px] leading-relaxed text-white/40">
          Light time is interpolated across the mission profile to show how the delay grows
          and shrinks. It is not computed from a trajectory, because AURORA does not model one.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Request flight surgeon consult', 'Acknowledge last advisory'].map((label) => (
            <Button
              key={label}
              variant="outline"
              onClick={() => setSent((s) => (s.includes(label) ? s : [...s, label]))}
              disabled={sent.includes(label)}
              icon={<Radio className="h-3.5 w-3.5" />}
            >
              {sent.includes(label) ? 'Queued' : label}
            </Button>
          ))}
        </div>
        {sent.length > 0 && (
          <p className="mono mt-2.5 text-[11px] text-cyan-200/70">
            {sent.length} message{sent.length > 1 ? 's' : ''} queued for the next downlink window.
            Queued locally for the demonstration; nothing is transmitted.
          </p>
        )}
      </div>
      <div>
        <p className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-white/40">Recent traffic</p>
        <ul className="space-y-2">
          {traffic.map((t, i) => (
            <li key={i} className={`border-l pl-3 ${t.tone === 'caution' || t.tone === 'watch' ? 'border-amber-300/40' : 'border-white/15'}`}>
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                MD {t.day} · {t.from}
              </p>
              <p className="text-[12.5px] text-white/85">{t.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- research
/**
 * The laboratory console. Everything here is read from the application's own
 * state: the indicator set the engine tracks, what it has currently flagged,
 * and how far the visitor has got with the visor. Nothing is invented, and no
 * experiment is claimed that the simulation does not run.
 */
function Research({ onLeave, onTask }: { onLeave: (page: 'signal-veil' | 'early-warning') => void; onTask: (t: TaskId) => void }) {
  const m = useMission()
  const open = m.alerts.filter((a) => a.active)
  const bySeverity = (sev: string) => open.filter((a) => a.severity === sev).length
  const phase = phaseForDay(m.viewDay)
  const veilDone = m.log.veil.length

  useEffect(() => {
    if (open.length >= 0) onTask('read-engine')
  }, [open.length, onTask])

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <p className="mono mb-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/40">
          <FlaskConical className="h-3 w-3" /> Constellation Engine
        </p>
        <Row label="Indicators tracked" value={`${Object.keys(INDICATORS).length}`} />
        <Row label="Baseline method" value="Rolling median, robust deviation" />
        <Row label="Records in window" value={`${m.visibleRecords.length}`} />
        <Row label="Mission phase" value={phase?.name ?? '—'} />
        <Row label="Runs" value="Entirely in this browser" />
        <p className="mt-3 text-[11.5px] leading-relaxed text-white/45">
          The engine compares each crew member against their own history rather than a
          population range, then asks whether several indicators moved together, persisted and
          are jointly unusual. It reports when the evidence does not support a relationship,
          which is most of the time.
        </p>
      </div>

      <div>
        <p className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-white/40">Currently flagged</p>
        <Row label="Action" value={`${bySeverity('critical') + bySeverity('caution')}`} tone={bySeverity('critical') + bySeverity('caution') ? 'alert' : 'ok'} />
        <Row label="Watch" value={`${bySeverity('watch')}`} />
        <Row label="Informational" value={`${bySeverity('info')}`} />
        <div className="mt-4 border-t border-white/12 pt-3">
          <p className="mono mb-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/40">Signal Veil</p>
          <Row label="Steps worked" value={`${veilDone} of 9`} />
          <Row label="Mission score" value={`${m.log.points} pts`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => { onTask('open-veil'); onLeave('signal-veil') }} icon={<ArrowUpRight className="h-3.5 w-3.5" />}>
            Open Signal Veil
          </Button>
          <Button variant="outline" onClick={() => onLeave('early-warning')}>
            Early warning
          </Button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/40">
          Synthetic mission data throughout. No experiment aboard this station is real and no
          finding here is clinical.
        </p>
      </div>
    </div>
  )
}

export function StationContent({
  id,
  onLeave,
  onTask,
  procDone,
  onProcStep,
  evaDone,
  evaSeconds,
}: {
  id: StationId
  onLeave: (page: 'signal-veil' | 'crew-health' | 'early-warning' | 'simulator') => void
  onTask: (t: TaskId) => void
  /** Completed procedure step keys. */
  procDone: readonly string[]
  onProcStep: (key: string) => void
  evaDone: boolean
  evaSeconds: number
}) {
  // Every console keeps the instruments it had; the procedures are added
  // underneath them, at the console where each belongs.
  const body =
    id === 'navigation' ? <Navigation />
    : id === 'medical' ? <Medical onLeave={onLeave} onTask={onTask} />
    : id === 'crew' ? <Crew onTask={onTask} />
    : id === 'environment' ? <Environment onLeave={onLeave} onTask={onTask} />
    : id === 'research' ? <Research onLeave={onLeave} onTask={onTask} />
    : <Comms />

  const procs = PROCEDURES_AT(id)
  return (
    <div>
      {body}
      {procs.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <ProcedurePanel
            at={id}
            done={procDone}
            onStep={onProcStep}
            onTask={onTask}
            evaDone={evaDone}
            evaSeconds={evaSeconds}
          />
        </div>
      )}
    </div>
  )
}
