import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Radio } from 'lucide-react'
import { useMission, ASTRONAUTS, MISSION } from '../hooks/useMission'
import { phaseForDay } from '../data/mission'
import { fmtDate, fmtElapsed } from '../lib/format'
import { LocalStars } from './visual/Atmosphere'
import { PlanetLimb, OrbitRings } from './visual/Celestial'

/**
 * The masthead of the archive. An enormous planetary limb rises from below the
 * frame; the mission's identity is set over it in editorial display type, with
 * live telemetry annotated down the right-hand margin like a plate caption.
 *
 * Motion is restrained: a slow pointer parallax on the celestial layers only,
 * disabled for coarse pointers and for anyone who prefers reduced motion.
 */
export function MissionHero() {
  const m = useMission()
  const phase = phaseForDay(m.viewDay)
  const ref = useRef<HTMLElement>(null)
  const [par, setPar] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || still) return

    let frame = 0
    const onMove = (e: PointerEvent) => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.bottom < 0) return
        setPar({
          x: (e.clientX / window.innerWidth - 0.5) * 2,
          y: (e.clientY / window.innerHeight - 0.5) * 2,
        })
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  const activeAlerts = m.alerts.filter((a) => a.active && a.severity !== 'info').length
  const nominal = m.statuses.filter((s) => s.status === 'nominal').length

  return (
    <section
      ref={ref}
      className="relative isolate -mx-4 -mt-5 mb-7 overflow-hidden border-b border-border md:-mx-6"
    >
      {/* ------------------------------------------------ celestial backdrop */}
      <div className="absolute inset-0 -z-10">
        <div className="plate-grid absolute inset-0 opacity-60" />
        <LocalStars seed={99021} count={110} />

        {/* Orbital diagram floating off the right margin */}
        <div
          className="absolute -right-24 top-4 hidden opacity-[0.22] lg:block"
          style={{ transform: `translate3d(${par.x * -14}px, ${par.y * -10}px, 0)`, transition: 'transform 1.4s cubic-bezier(0.16,1,0.3,1)' }}
        >
          <OrbitRings size={430} className="orbit-rev" />
        </div>

        {/* The planet itself, drifting against the pointer */}
        <div
          className="absolute inset-x-0 bottom-0 h-[78%]"
          style={{ transform: `translate3d(${par.x * 10}px, ${par.y * 6}px, 0) scale(1.04)`, transition: 'transform 1.8s cubic-bezier(0.16,1,0.3,1)' }}
        >
          <PlanetLimb />
        </div>

        {/* The aurora the programme is named for */}
        <AuroraBand />

        {/* Scrim: holds the type legible wherever the composition falls */}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/85 via-bg/20 to-bg/55" />
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-bg/80 to-transparent" />
      </div>

      {/* --------------------------------------------------------- foreground */}
      <div className="relative px-4 pb-10 pt-11 md:px-6 md:pb-14 md:pt-14">
        <div className="grid items-end gap-10 lg:grid-cols-12">
          {/* Masthead */}
          <div className="reveal lg:col-span-7">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="eyebrow">NASA Space Apps Challenge 2026</span>
              <span className="hidden h-px w-10 bg-border-strong sm:block" />
              <span className="annotate">PLATE 01 — {MISSION.designation}</span>
            </div>

            <h1 className="display mt-5 text-[clamp(2.9rem,8.4vw,7rem)]">
              AURORA
            </h1>

            <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-text md:text-base">
              Continuous health intelligence for crews beyond low Earth orbit — monitoring,
              explainable early warning and mission simulation, drawn together in one
              instrument.
            </p>

            <p className="display-italic mt-7 text-[clamp(1.2rem,2.3vw,1.75rem)] leading-snug text-text-strong">
              “Because every explorer matters.
              <br className="hidden sm:block" /> Every signal counts.”
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
              <button
                onClick={() => m.setPage('early-warning')}
                className="group inline-flex items-center gap-2.5 border border-border-strong bg-surface-2/70 px-4 py-2.5 text-[13px] font-medium text-text-strong backdrop-blur-sm transition-colors hover:border-accent/60 hover:bg-surface-3/70"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${activeAlerts ? 'bg-ember pulse' : 'bg-ok'}`} />
                {activeAlerts} signal{activeAlerts === 1 ? '' : 's'} under review
                <ArrowRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </button>
              <button
                onClick={() => m.setPage('presentation')}
                className="inline-flex items-center gap-2 text-[13px] text-muted underline-offset-4 transition-colors hover:text-text-strong hover:underline"
              >
                Read the mission brief
              </button>
            </div>
          </div>

          {/* Plate caption — live telemetry down the right margin */}
          <div className="reveal relative lg:col-span-5 lg:pb-2" style={{ animationDelay: '140ms' }}>
            {/* A soft vignette, so the readouts sit legibly over the limb */}
            <div
              className="pointer-events-none absolute -inset-x-8 -inset-y-7"
              style={{ background: 'radial-gradient(ellipse 68% 58% at 52% 50%, var(--scrim), transparent 74%)' }}
            />
            <div className="relative">
            <div className="flex items-center gap-2 border-b border-border pb-2.5">
              <Radio className={`h-3 w-3 ${m.isLive ? 'text-ok' : 'text-warn'}`} />
              <span className="eyebrow-sm">{m.isLive ? 'Live downlink' : 'Archive playback'}</span>
              <span className="annotate ml-auto">{fmtDate(m.viewDay)}</span>
            </div>

            <dl className="grid grid-cols-2 gap-x-6">
              <Readout label="Mission elapsed" value={fmtElapsed(m.viewDay)} note={`MD ${m.viewDay} of ${MISSION.totalDays}`} />
              <Readout label="Phase" value={phase.name.split(' ')[0]} note={phase.name} />
              <Readout label="Crew" value={String(ASTRONAUTS.length)} note={`${nominal} nominal · ${ASTRONAUTS.length - nominal} under review`} />
              <Readout
                label="Composite"
                value={String(Math.round(m.crew))}
                note="operational aid, not clinical"
                tone={m.crew >= 80 ? 'ok' : m.crew >= 65 ? 'warn' : 'danger'}
              />
            </dl>

            {/* Mission progress, ruled like a measuring scale */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow-sm">Transit profile</span>
                <span className="annotate">{Math.round((m.viewDay / MISSION.totalDays) * 100)}%</span>
              </div>
              <div className="relative mt-2 h-px w-full bg-border-strong">
                <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${(m.viewDay / MISSION.totalDays) * 100}%` }} />
                <div
                  className="absolute -top-[3px] h-[7px] w-[7px] -translate-x-1/2 rotate-45 border border-accent bg-bg"
                  style={{ left: `${(m.viewDay / MISSION.totalDays) * 100}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between">
                <span className="annotate">EARTH DEPARTURE</span>
                <span className="annotate">{MISSION.destination.toUpperCase()}</span>
                <span className="annotate">RECOVERY</span>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Archival footer rule */}
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border px-4 py-2.5 md:px-6">
        <span className="annotate">{MISSION.name.toUpperCase()}</span>
        <span className="annotate hidden sm:inline">CREW OF {ASTRONAUTS.length}</span>
        <span className="annotate hidden md:inline">{MISSION.totalDays}-DAY PROFILE</span>
        <span className="annotate ml-auto text-ember">SYNTHETIC DATASET — NOT A NASA MEASUREMENT</span>
      </div>
    </section>
  )
}

function Readout({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: 'ok' | 'warn' | 'danger' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-text-strong'
  return (
    <div className="border-b border-border py-3.5">
      <dt className="eyebrow-sm">{label}</dt>
      <dd className={`mono mt-1.5 text-xl font-medium leading-none ${color}`}>{value}</dd>
      {note && <p className="mt-1.5 text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  )
}

/** A band of aurora drawn above the limb — the programme's namesake. */
function AuroraBand() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-[16%] h-[40%] w-full"
      viewBox="0 0 1200 240"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="aur-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--ember)" stopOpacity="0" />
          <stop offset="26%" stopColor="var(--ember)" stopOpacity="0.5" />
          <stop offset="52%" stopColor="#ffb27a" stopOpacity="0.55" />
          <stop offset="78%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aur-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0" />
          <stop offset="40%" stopColor="var(--accent-2)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0" />
        </linearGradient>
        <filter id="aur-blur" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
        <filter id="aur-blur-soft" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
      </defs>
      <g style={{ opacity: 'var(--star-opacity)' }}>
        <path d="M-40 196 C 260 92, 560 74, 900 122 C 1060 144, 1160 170, 1248 184" fill="none" stroke="url(#aur-a)" strokeWidth="13" filter="url(#aur-blur)" />
        <path d="M-40 206 C 280 110, 600 96, 940 140 C 1080 158, 1170 180, 1248 192" fill="none" stroke="url(#aur-b)" strokeWidth="30" filter="url(#aur-blur-soft)" opacity="0.6" />
        <path d="M-40 196 C 260 92, 560 74, 900 122 C 1060 144, 1160 170, 1248 184" fill="none" stroke="#ffd9bd" strokeWidth="1.1" opacity="0.4" />
      </g>
    </svg>
  )
}
