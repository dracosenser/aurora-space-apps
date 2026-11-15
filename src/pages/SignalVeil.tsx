import { useCallback, useMemo, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { useMission, ASTRONAUTS, EVENTS, MISSION } from '../hooks/useMission'
import { datasetFromDailyRecords } from '../data/engineAdapters'
import { SignalVeilExperience, type ExperienceProgress } from '../features/signal-veil'
import type { RecordedAction } from '../engine/types'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Disclaimer, RuledHeading } from '../components/ui/Misc'
import { VEIL_STEPS, PATCH_BY_ID } from '../lib/gamify'

const ACTIONS_KEY = 'aurora.veil.actions.v1'

function loadActions(): RecordedAction[] {
  try {
    const raw = localStorage.getItem(ACTIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecordedAction[]
    return Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.day === 'number' && Array.isArray(a.targetIndicators)) : []
  } catch {
    return []
  }
}

function saveActions(actions: RecordedAction[]) {
  try {
    localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions))
  } catch {
    /* storage unavailable: keep in memory */
  }
}

/**
 * SIGNAL VEIL as a page of the main application.
 *
 * The standalone demonstration at /signal-veil.html runs a fictional 150-day
 * mission. This page instead points the same instrument at the crew of the
 * Ares Meridiani demonstration — the records, events and mission day the rest
 * of AURORA is already showing — and banks what the visitor works out onto the
 * same score and patch board as the self-assessment, so the two halves are one
 * game rather than two.
 */
export function SignalVeil() {
  const { records, viewDay, selectedAstronautId, setSelectedAstronautId, log, recordVeilProgress, isLive } = useMission()

  const astronaut = useMemo(
    () => ASTRONAUTS.find((a) => a.id === selectedAstronautId) ?? ASTRONAUTS[0],
    [selectedAstronautId],
  )

  // The dataset spans the whole elapsed mission and stays stable for a given
  // crew member: the visor's day state is fixed at mount, and the feature has
  // its own timeline. The top-bar day only decides where the visor opens, so
  // moving that slider never tears down the fog or the WebGL context.
  const dataset = useMemo(
    () => datasetFromDailyRecords(records, astronaut, EVENTS, MISSION.currentDay),
    [records, astronaut],
  )

  const [userActions, setUserActions] = useState<RecordedAction[]>(loadActions)
  const [resetKey, setResetKey] = useState(0)

  const record = useCallback((a: RecordedAction) => {
    setUserActions((prev) => {
      const next = [...prev, a]
      saveActions(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setUserActions((prev) => {
      const next = prev.filter((a) => a.id !== id)
      saveActions(next)
      return next
    })
  }, [])

  // Progress is reported continuously; only steps not already banked score.
  const onProgress = useCallback(
    (p: ExperienceProgress) => {
      const done = VEIL_STEPS.filter((s) => p[s.id as keyof ExperienceProgress]).map((s) => s.id)
      const fresh = done.filter((id) => !log.veil.includes(id))
      if (fresh.length) recordVeilProgress(fresh)
    },
    [log.veil, recordVeilProgress],
  )

  const banked = new Set(log.veil)
  const done = VEIL_STEPS.filter((s) => banked.has(s.id)).length
  const veilPatches = ['visor-clear', 'first-contact', 'full-sweep-veil'].map((id) => ({
    id,
    patch: PATCH_BY_ID[id],
    earned: log.patches.includes(id),
  }))

  return (
    <div>
      <PageHeader
        eyebrow="Operations · 03"
        plate="PLATE SV"
        title="Signal Veil"
        description="Your breath has fogged the visor. Wipe it clear, and behind the condensation is this crew member's health signals as a constellation — several that each moved only slightly, but moved together. Everything you work out here scores on the mission board."
        actions={
          <Button
            variant="outline"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => setResetKey((k) => k + 1)}
          >
            Fog the visor again
          </Button>
        }
      />

      {/* ------------------------------------------------------ crew selector */}
      <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-3 border border-border px-4 py-3">
        <span className="eyebrow-sm shrink-0">In the visor</span>
        <div className="flex flex-wrap gap-1.5">
          {ASTRONAUTS.map((a) => {
            const on = a.id === astronaut.id
            return (
              <button
                key={a.id}
                onClick={() => setSelectedAstronautId(a.id)}
                aria-pressed={on}
                className={`mono border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors duration-200 ${
                  on ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:border-border-strong hover:text-text'
                }`}
              >
                {a.initials} · {a.callsign}
              </button>
            )
          })}
        </div>
        <span className="annotate ml-auto shrink-0">
          {astronaut.role.toUpperCase()} · MD {viewDay}
          {!isLive && ' · PLAYBACK'}
        </span>
      </div>

      {/* --------------------------------------------------- the instrument */}
      <SignalVeilExperience
        key={`${astronaut.id}-${resetKey}`}
        dataset={dataset}
        config={{ baseline: { mode: 'rolling' } }}
        initialDay={Math.min(viewDay, MISSION.currentDay)}
        userActions={userActions}
        onRecordAction={record}
        onRemoveAction={remove}
        onProgress={onProgress}
      />

      {/* --------------------------------------------------------- the board */}
      <div className="mt-10">
        <RuledHeading note={`${done} OF ${VEIL_STEPS.length} BANKED`}>What the visor is worth</RuledHeading>

        <div className="grid gap-4 lg:grid-cols-12">
          <section className="panel min-w-0 p-4 lg:col-span-7">
            <p className="eyebrow-sm">Instrument log</p>
            <ol className="mt-3 space-y-1.5">
              {VEIL_STEPS.map((s, i) => {
                const ok = banked.has(s.id)
                return (
                  <li key={s.id} className={`flex items-center gap-2.5 text-xs ${ok ? 'text-text-strong' : 'text-muted'}`}>
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                        ok ? 'border-accent text-accent' : 'border-border-strong'
                      }`}
                      style={ok ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : undefined}
                    >
                      {ok ? <Check className="h-3 w-3" /> : <span className="mono text-[9px]">{i + 1}</span>}
                    </span>
                    <span className="min-w-0 flex-1">{s.label}</span>
                    <span className="annotate shrink-0">+{s.points}</span>
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="panel min-w-0 p-4 lg:col-span-5">
            <p className="eyebrow-sm">Patches from this instrument</p>
            <div className="mt-3 grid gap-px bg-border sm:grid-cols-3">
              {veilPatches.map(({ id, patch, earned }) => (
                <div key={id} className="bg-surface p-3">
                  <p className={`text-[13px] ${earned ? 'text-ember' : 'text-muted'}`}>{patch?.label ?? id}</p>
                  <p className="annotate mt-0.5">{earned ? 'EARNED' : 'LOCKED'}</p>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted">{patch?.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <dl className="mono grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
                <dt className="text-muted">Mission score</dt>
                <dd className="text-text">{log.points} pts</dd>
                <dt className="text-muted">Patches held</dt>
                <dd className="text-text">{log.patches.length}</dd>
                <dt className="text-muted">Engine</dt>
                <dd className="text-text">runs in this browser</dd>
              </dl>
            </div>
          </section>
        </div>

        <Disclaimer className="mt-5">
          Drawing a line never creates a relationship — it reveals what the Constellation Engine already computed for
          that pair on that day. Points are an engagement score for a simulation, not a health score, and nothing on
          this page is a diagnosis or medical advice.
        </Disclaimer>
      </div>
    </div>
  )
}
