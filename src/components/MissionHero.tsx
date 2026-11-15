import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { useMission, ASTRONAUTS, MISSION } from '../hooks/useMission'
import { phaseForDay } from '../data/mission'
import { fmtDate, fmtElapsed } from '../lib/format'
import { MissionPatch } from './visual/Insignia'
import { Coordinates } from './visual/Celestial'

/**
 * The masthead, set as the opening spread of a publication: a running head, an
 * oversized serif title held against the mission insignia, and a ruled
 * telemetry strip closing the spread. Asymmetric by design — seven columns of
 * type against five of insignia.
 */
export function MissionHero() {
  const m = useMission()
  const phase = phaseForDay(m.viewDay)
  const activeAlerts = m.alerts.filter((a) => a.active && a.severity !== 'info').length
  const nominal = m.statuses.filter((s) => s.status === 'nominal').length
  const transit = Math.round((m.viewDay / MISSION.totalDays) * 100)

  return (
    <section className="-mx-4 mb-10 border-b border-border md:-mx-6">
      {/* Running head */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 md:px-6">
        <span className="eyebrow">AURORA — Astronaut Health Intelligence</span>
        <span className="annotate hidden sm:inline">{MISSION.designation}</span>
        <span className="annotate">01</span>
      </div>

      <div className="px-4 pb-0 pt-9 md:px-6 md:pt-11">
        <div className="grid gap-x-8 gap-y-10 lg:grid-cols-12">
          {/* ------------------------------------------------- type column */}
          <div className="reveal lg:col-span-7">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="eyebrow">NASA Space Apps Challenge 2026</span>
              <span className="hidden h-px w-12 bg-border-strong sm:block" />
              <span className="annotate">PLATE I</span>
            </div>

            <h1 className="display mt-6 text-[clamp(3rem,9vw,7.2rem)]">AURORA</h1>

            <p className="mt-5 max-w-sm text-[11px] uppercase leading-relaxed tracking-[0.17em] text-muted">
              Autonomous Understanding of Risk, Observation &amp; Astronaut Resilience
            </p>

            <p className="mt-6 max-w-lg text-[15px] leading-[1.7] text-text">
              Continuous health intelligence for crews beyond low Earth orbit — monitoring,
              explainable early warning and mission simulation, drawn together in one instrument.
            </p>

            <p className="display-italic mt-7 max-w-lg text-[clamp(1.3rem,2.4vw,1.85rem)] text-text-strong">
              “Because every explorer matters. Every signal counts.”
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button
                onClick={() => m.setPage('early-warning')}
                className="group inline-flex items-center gap-3 border border-border-strong px-5 py-3 text-[12px] font-medium uppercase tracking-[0.18em] text-text-strong transition-colors duration-300 hover:bg-surface-3"
              >
                <span className={`h-1.5 w-1.5 ${activeAlerts ? 'bg-ember' : 'bg-ok'}`} />
                {activeAlerts} signal{activeAlerts === 1 ? '' : 's'} under review
                <ArrowRight className="h-3.5 w-3.5 text-muted transition-transform duration-300 group-hover:translate-x-1" />
              </button>
              <button
                onClick={() => m.setPage('presentation')}
                className="eyebrow text-text transition-colors hover:text-text-strong"
              >
                Read the mission brief
              </button>
            </div>

            <Coordinates
              className="mt-9 max-w-xs"
              rows={[
                ['DESIGNATION', MISSION.designation],
                ['DESTINATION', MISSION.destination.toUpperCase()],
                ['PROFILE', `${MISSION.totalDays} DAYS · ${MISSION.phases.length} PHASES`],
                ['DATASET', 'SYNTHETIC — NOT A NASA MEASUREMENT'],
              ]}
            />
          </div>

          {/* ---------------------------------------------- mission insignia */}
          <div className="reveal flex flex-col items-center lg:col-span-5 lg:items-start lg:pt-4" style={{ animationDelay: '120ms' }}>
            <MissionPatch size={280} className="max-w-full text-text-strong" />
            <div className="mt-6 w-full border-t border-border pt-3">
              <p className="annotate">MISSION INSIGNIA · AURORA</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Drawn for this project. Not a NASA insignia and not NASA-endorsed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- telemetry strip */}
      <div className="mt-10 border-t border-border">
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border md:grid-cols-4">
          <Readout label="Mission elapsed" value={fmtElapsed(m.viewDay)} note={`MD ${m.viewDay} of ${MISSION.totalDays}`} />
          <Readout label="Phase" value={phase.name.split(' ')[0]} note={phase.name} />
          <Readout label="Crew" value={String(ASTRONAUTS.length)} note={`${nominal} nominal · ${ASTRONAUTS.length - nominal} under review`} />
          <Readout
            label="Composite"
            value={String(Math.round(m.crew))}
            note="operational aid, not clinical"
            tone={m.crew >= 80 ? 'ok' : m.crew >= 65 ? 'warn' : 'danger'}
          />
        </div>

        {/* Transit profile, ruled as a measuring scale */}
        <div className="flex items-center gap-5 px-4 py-3.5 md:px-6">
          <span className="eyebrow-sm shrink-0">Transit</span>
          <div className="relative h-px flex-1 bg-border-strong">
            <div className="absolute inset-y-0 left-0 bg-text-strong" style={{ width: `${transit}%` }} />
            <div className="absolute -top-[3px] h-[7px] w-px bg-text-strong" style={{ left: `${transit}%` }} />
          </div>
          <span className="annotate shrink-0">{transit}%</span>
          <span className={`annotate hidden shrink-0 sm:inline ${m.isLive ? 'text-ok' : 'text-warn'}`}>
            {m.isLive ? 'LIVE' : 'PLAYBACK'} · {fmtDate(m.viewDay).toUpperCase()}
          </span>
        </div>
      </div>
    </section>
  )
}

function Readout({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: 'ok' | 'warn' | 'danger' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-text-strong'
  return (
    <div className="px-4 py-5 md:px-6">
      <p className="eyebrow-sm">{label}</p>
      <p className={`display mt-2.5 text-[26px] leading-none ${color}`}>{value}</p>
      {note && <p className="annotate mt-2">{note.toUpperCase()}</p>}
    </div>
  )
}
