import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Crosshair, Timer } from 'lucide-react'
import { useMission } from '../hooks/useMission'
import { CHECKS, bandFor, type Band, type CheckId, type SystemId } from '../data/selfcheck'
import { BODY_SYSTEMS, HAZARDS, HAZARD_BY_ID, SYSTEM_BY_ID } from '../data/bodySystems'
import {
  PATCH_BY_ID,
  PATCHES,
  PROTOCOLS,
  computeReadiness,
  fmtCountdown,
  periodRemaining,
  readingsForDay,
} from '../lib/gamify'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Disclaimer, RuledHeading } from '../components/ui/Misc'
import { BodyFigure, SystemIndex } from '../components/visual/BodyFigure'
import { ThreeRing } from '../components/visual/ThreeRing'

const BAND_TONE: Record<Band, 'ok' | 'warn' | 'danger'> = {
  nominal: 'ok',
  watch: 'warn',
  caution: 'danger',
}
const BAND_VAR: Record<Band, string> = {
  nominal: 'var(--ok)',
  watch: 'var(--warn)',
  caution: 'var(--danger)',
}

export function SelfCheck() {
  const m = useMission()
  const day = m.viewDay
  const taken = useMemo(() => readingsForDay(m.log, day), [m.log, day])

  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<number | null>(null)
  const [system, setSystem] = useState<SystemId | null>('cardiovascular')
  const [now, setNow] = useState(() => Date.now())

  const def = CHECKS[step]
  const existing = taken[def.id]
  const value = draft ?? existing?.value ?? def.seed
  const band = bandFor(def, value)

  // The duty-period clock runs on real time, so the window genuinely closes
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Moving between checks clears the draft so each opens on its own value
  useEffect(() => setDraft(null), [step])

  const remaining = periodRemaining(m.log.periodOpenedAt, now)
  const periodOpen = m.log.periodOpenedAt > 0
  const expired = periodOpen && remaining === 0
  const readiness = computeReadiness(m.log, day)
  const loggedCount = CHECKS.filter((c) => taken[c.id]).length

  /** Worst band per system, for the figure's at-a-glance colour. */
  const systemBands = useMemo(() => {
    const out: Partial<Record<SystemId, Band | null>> = {}
    for (const sys of BODY_SYSTEMS) {
      let worst: Band | null = null
      for (const id of sys.checks) {
        const r = taken[id]
        if (!r) continue
        const b = bandFor(CHECKS.find((c) => c.id === id)!, r.value)
        if (b === 'caution') worst = 'caution'
        else if (b === 'watch' && worst !== 'caution') worst = 'watch'
        else if (worst === null) worst = 'nominal'
      }
      out[sys.id] = worst
    }
    return out
  }, [taken])

  const log = () => {
    if (!periodOpen) m.openPeriod()
    m.logReading(def.id, value)
    setDraft(null)
    const nextOpen = CHECKS.findIndex((c, i) => i > step && !taken[c.id])
    if (nextOpen >= 0) setStep(nextOpen)
    else if (step < CHECKS.length - 1) setStep(step + 1)
  }

  const sel = system ? SYSTEM_BY_ID[system] : null

  return (
    <div>
      <PageHeader
        eyebrow="Operations · 02"
        plate="FORM AUR-MED-01"
        title="Self-Assessment"
        description="Take your own readings, see what each one means, and act on it. Every measurement here is entered by the crew member — nothing on this page is sensed automatically."
      />

      {/* ------------------------------------------------- duty period strip */}
      <div
        className={`mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 border px-4 py-3 transition-colors duration-500 ${
          expired ? 'border-warn/50' : 'border-border'
        }`}
        style={expired ? { background: 'color-mix(in srgb, var(--warn) 7%, transparent)' } : undefined}
      >
        <span className="flex items-center gap-2">
          <Timer className={`h-3.5 w-3.5 ${expired ? 'text-warn' : 'text-muted'}`} />
          <span className="eyebrow-sm">Duty period</span>
        </span>

        {periodOpen ? (
          <span className={`mono text-[22px] leading-none tabular-nums ${expired ? 'text-warn breathe' : 'text-text-strong'}`}>
            {fmtCountdown(remaining)}
          </span>
        ) : (
          <span className="annotate">NOT OPENED</span>
        )}

        <span className="annotate">
          {loggedCount}/{CHECKS.length} READINGS LOGGED
        </span>

        {expired && (
          <span className="annotate text-warn">
            WINDOW CLOSED — READINESS HELD AT LAST COMPLETE BATTERY
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="annotate">
            STREAK {m.log.streak}D · {m.log.points} PTS
          </span>
          <Button size="sm" variant={periodOpen && !expired ? 'ghost' : 'ember'} onClick={m.openPeriod}>
            {periodOpen ? 'Restart period' : 'Open period'}
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------- battery */}
      <section className="mb-14">
        <RuledHeading note={`STEP ${String(step + 1).padStart(2, '0')} OF ${CHECKS.length}`}>
          Measurement battery
        </RuledHeading>

        <div className="grid items-start gap-5 lg:grid-cols-12">
          {/* the current check */}
          <div className="panel relative min-w-0 lg:col-span-7">
            {/* progress ticks across the top edge */}
            <div className="no-scrollbar flex overflow-x-auto border-b border-border">
              {CHECKS.map((c, i) => {
                const r = taken[c.id]
                const b = r ? bandFor(c, r.value) : null
                return (
                  <button
                    key={c.id}
                    onClick={() => setStep(i)}
                    title={c.label}
                    className={`group relative min-w-[52px] flex-1 border-r border-border px-1 py-2 text-center transition-colors duration-200 last:border-r-0 ${
                      i === step ? 'bg-surface-3' : 'hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className="mx-auto mb-1.5 block h-1 w-1"
                      style={{ background: b ? BAND_VAR[b] : 'var(--faint)' }}
                    />
                    <span className={`annotate ${i === step ? 'text-text-strong' : ''}`}>{c.short}</span>
                  </button>
                )
              })}
            </div>

            <div className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="display text-[26px]">{def.label}</h3>
                <Badge tone={BAND_TONE[band]} dot>
                  {band}
                </Badge>
              </div>

              {/* capture: drag, type, or step */}
              <div className="mt-6 flex items-end gap-5">
                <div>
                  <p className="eyebrow-sm">Reading</p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <input
                      type="number"
                      value={Number(value.toFixed(def.decimals))}
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      onChange={(e) => setDraft(Number(e.target.value))}
                      aria-label={`${def.label} in ${def.unit}`}
                      className="mono w-28 border border-border-strong bg-transparent px-2 py-1 text-[30px] leading-none tabular-nums text-text-strong outline-none transition-colors focus:border-text-strong"
                    />
                    <span className="mono text-[13px] text-muted">{def.unit}</span>
                  </div>
                </div>
                <div className="mb-1 flex gap-1.5">
                  <button
                    onClick={() => setDraft(Math.max(def.min, value - def.step))}
                    className="border border-border px-2.5 py-1 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text-strong"
                    aria-label="Decrease"
                  >
                    −
                  </button>
                  <button
                    onClick={() => setDraft(Math.min(def.max, value + def.step))}
                    className="border border-border px-2.5 py-1 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text-strong"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
              </div>

              <input
                type="range"
                className="mt-5"
                min={def.min}
                max={def.max}
                step={def.step}
                value={value}
                onChange={(e) => setDraft(Number(e.target.value))}
                style={{ ['--fill' as string]: `${((value - def.min) / (def.max - def.min)) * 100}%` }}
                aria-label={`${def.label} slider`}
              />

              {/* the reference band, drawn to scale */}
              <div className="relative mt-3 h-[3px] w-full bg-border">
                <span
                  className="absolute inset-y-0"
                  style={{
                    left: `${((def.watch[0] - def.min) / (def.max - def.min)) * 100}%`,
                    width: `${((def.watch[1] - def.watch[0]) / (def.max - def.min)) * 100}%`,
                    background: 'var(--warn)',
                    opacity: 0.45,
                  }}
                />
                <span
                  className="absolute inset-y-0"
                  style={{
                    left: `${((def.nominal[0] - def.min) / (def.max - def.min)) * 100}%`,
                    width: `${((def.nominal[1] - def.nominal[0]) / (def.max - def.min)) * 100}%`,
                    background: 'var(--ok)',
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between">
                <span className="annotate">{def.min}</span>
                <span className="annotate">
                  REFERENCE BAND {def.nominal[0]}–{def.nominal[1]} {def.unit}
                </span>
                <span className="annotate">{def.max}</span>
              </div>

              {/* what it means, and what to do */}
              <div
                className="mt-6 border-l-2 pl-4"
                style={{ borderColor: BAND_VAR[band] }}
              >
                <p className="eyebrow-sm" style={{ color: BAND_VAR[band] }}>
                  Action
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text">{def.action[band]}</p>
              </div>

              <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <div>
                  <dt className="eyebrow-sm">How to take it</dt>
                  <dd className="mt-1.5 text-[12px] leading-relaxed text-muted">{def.how}</dd>
                </div>
                <div>
                  <dt className="eyebrow-sm">Why it matters up here</dt>
                  <dd className="mt-1.5 text-[12px] leading-relaxed text-muted">{def.why}</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowLeft className="h-3.5 w-3.5" />}
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                >
                  Back
                </Button>
                <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={log}>
                  {existing ? 'Update reading' : 'Log reading'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                  onClick={() => setStep(Math.min(CHECKS.length - 1, step + 1))}
                  disabled={step === CHECKS.length - 1}
                >
                  Skip
                </Button>
                {existing && (
                  <span className="annotate ml-auto">
                    LOGGED MD {existing.day} · {new Date(existing.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* readiness instrument */}
          <div className="min-w-0 lg:col-span-5">
            <div className="panel flex flex-col items-center p-5">
              <ThreeRing
                value={readiness.score}
                label="Readiness"
                status={readiness.band}
                tone={BAND_VAR[readiness.band]}
                size={232}
              />
              <ul className="mt-4 w-full space-y-1.5 border-t border-border pt-4">
                {readiness.drivers.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-[12px] leading-snug text-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 bg-faint" />
                    {d}
                  </li>
                ))}
              </ul>
              <p className="annotate mt-4 w-full border-t border-border pt-3">
                ENGAGEMENT SCORE FOR THIS SIMULATION — NOT A MEDICAL ASSESSMENT
              </p>
            </div>

            {/* patches earned */}
            <div className="panel mt-4 p-4">
              <p className="eyebrow-sm">Mission patches</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {PATCHES.map((p) => {
                  const won = m.log.patches.includes(p.id)
                  return (
                    <div
                      key={p.id}
                      title={p.detail}
                      className={`border px-2.5 py-2 transition-colors duration-300 ${
                        won ? 'border-ember/50' : 'border-border'
                      }`}
                    >
                      <p className={`text-[11px] font-medium ${won ? 'text-ember' : 'text-faint'}`}>{p.label}</p>
                      <p className="annotate mt-0.5 truncate">{won ? 'EARNED' : 'LOCKED'}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- body systems */}
      <section className="mb-14">
        <RuledHeading note="SELECT A SYSTEM">Body systems</RuledHeading>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="panel min-w-0 p-4 lg:col-span-4">
            <BodyFigure statuses={systemBands} selected={system} onSelect={setSystem} />
          </div>

          <div className="min-w-0 lg:col-span-3">
            <p className="eyebrow-sm mb-2">Index</p>
            <SystemIndex statuses={systemBands} selected={system} onSelect={setSystem} />
          </div>

          <div className="panel min-w-0 p-5 lg:col-span-5">
            {sel ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Crosshair className="h-3.5 w-3.5 text-muted" />
                  <h3 className="display text-[22px]">{sel.label}</h3>
                  {systemBands[sel.id] && <Badge tone={BAND_TONE[systemBands[sel.id]!]}>{systemBands[sel.id]}</Badge>}
                </div>

                <p className="mt-4 text-[13px] leading-relaxed text-text">{sel.does}</p>

                <p className="eyebrow-sm mt-5">In long-duration flight</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{sel.inFlight}</p>

                <p className="eyebrow-sm mt-5">Driven by</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sel.hazards.map((h) => (
                    <Badge key={h} tone="neutral">
                      {HAZARD_BY_ID[h].label}
                    </Badge>
                  ))}
                </div>

                <p className="eyebrow-sm mt-5">Countermeasures</p>
                <ul className="mt-2 space-y-1.5">
                  {sel.countermeasures.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-[12px] leading-snug text-text">
                      <span className="mt-1.5 h-1 w-1 shrink-0 bg-ok" />
                      {c}
                    </li>
                  ))}
                </ul>

                {sel.checks.length > 0 && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="eyebrow-sm">Readings on this system</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sel.checks.map((id: CheckId) => {
                        const c = CHECKS.find((x) => x.id === id)!
                        const r = taken[id]
                        const b = r ? bandFor(c, r.value) : null
                        return (
                          <button
                            key={id}
                            onClick={() => setStep(CHECKS.findIndex((x) => x.id === id))}
                            className="border border-border px-2.5 py-1.5 text-left transition-colors hover:border-border-strong"
                          >
                            <span className="annotate block">{c.short}</span>
                            <span className="mono text-[13px]" style={{ color: b ? BAND_VAR[b] : 'var(--faint)' }}>
                              {r ? r.value.toFixed(c.decimals) : '—'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[13px] text-muted">Select a system on the figure or in the index.</p>
            )}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- protocol board */}
      <section className="mb-14">
        <RuledHeading note={`${PROTOCOLS.filter((p) => m.log.cleared[p.id] === day).length}/${PROTOCOLS.length} CLEARED`}>
          Protocol board
        </RuledHeading>
        <ul className="divide-y divide-border border-y border-border">
          {PROTOCOLS.map((p) => {
            const done = m.log.cleared[p.id] === day
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 py-3.5">
                <span
                  className="h-2 w-2 shrink-0"
                  style={{ background: done ? 'var(--ok)' : expired ? 'var(--warn)' : 'var(--faint)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-medium ${done ? 'text-muted line-through' : 'text-text-strong'}`}>{p.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">{p.detail}</p>
                </div>
                <span className="annotate shrink-0">{p.minutes} MIN</span>
                <span className="annotate shrink-0 text-ember">+{p.points} PTS</span>
                <Button
                  size="sm"
                  variant={done ? 'ghost' : 'outline'}
                  onClick={() => m.clearProtocol(p.id)}
                  disabled={done}
                  className="shrink-0"
                >
                  {done ? 'Cleared' : 'Mark cleared'}
                </Button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* -------------------------------------------------------- hazards */}
      <section className="mb-10">
        <RuledHeading note="NASA HUMAN RESEARCH PROGRAM FRAMING">The five hazards</RuledHeading>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {HAZARDS.map((h, i) => (
            <div key={h.id} className="panel p-4">
              <div className="flex items-baseline gap-2.5">
                <span className="annotate">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-[13px] font-medium text-text-strong">{h.label}</h3>
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{h.blurb}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {h.systems.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSystem(s)}
                    className="annotate border border-border px-1.5 py-0.5 transition-colors hover:border-border-strong hover:text-text-strong"
                  >
                    {SYSTEM_BY_ID[s].label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Disclaimer tone="warn" className="md:col-span-2 xl:col-span-1">
            <strong className="text-text-strong">Reference bands, not clinical thresholds.</strong> The ranges on this
            page are general adult reference values driving a demonstration. They are not personalised, nothing here
            recommends a treatment, and every escalation routes to the flight surgeon — which is what the real protocol
            does.
          </Disclaimer>
        </div>
      </section>

      {/* A patch award reads as an event, so it gets its own line */}
      {m.log.patches.length > 0 && (
        <p className="annotate border-t border-border pt-4">
          PATCHES EARNED: {m.log.patches.map((id) => PATCH_BY_ID[id]?.label.toUpperCase()).filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}
