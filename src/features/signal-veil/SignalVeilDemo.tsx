import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, Check, RotateCcw } from 'lucide-react'
import { createMissionAnalysis } from '../../engine/analysis'
import type { Provenance, RecordedAction } from '../../engine/types'
import { generateVeilMission, VEIL_ENGINE_CONFIG } from '../../data/veilMission'
import { Button } from '../../components/ui/Button'
import { SignalVeilExperience, type ExperienceProgress } from './SignalVeilExperience'
import { ProvenanceTag } from './ui/shared'

const STORAGE_KEY = 'aurora.veil.actions.v1'
const START_DAY = 115

function loadActions(): RecordedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecordedAction[]
    return Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.day === 'number' && Array.isArray(a.targetIndicators)) : []
  } catch {
    return []
  }
}

function saveActions(actions: RecordedAction[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions))
  } catch {
    /* storage unavailable: keep in memory */
  }
}

const STEPS: { key: keyof ExperienceProgress; label: string }[] = [
  { key: 'wiped', label: 'Wipe the fog from the visor' },
  { key: 'cleared', label: 'Reveal the whole constellation' },
  { key: 'inspected', label: 'Click a signal and read its history' },
  { key: 'connected', label: 'Drag a line between two signals' },
  { key: 'foundSupported', label: 'Find a relationship the evidence supports' },
  { key: 'scrubbed', label: 'Move through the mission timeline' },
  { key: 'replayed', label: 'Replay how the pattern developed' },
  { key: 'readFindings', label: 'Read the engine\'s explanation' },
  { key: 'viewedResponse', label: 'See what followed the recorded action' },
]

const PROVENANCES: { p: Provenance; note: string }[] = [
  { p: 'synthetic-demo', note: 'Every measurement in this demonstration.' },
  { p: 'statistical-estimate', note: 'Baselines, shifts, patterns, relationships and comparisons computed by the engine.' },
  { p: 'user-entered', note: 'Actions you record in the Response panel.' },
  { p: 'imported', note: 'Supported by the data model; none in this demonstration.' },
  { p: 'nasa-research', note: 'Supported by the data model; none in this demonstration. See docs/NASA_DATA.md.' },
]

/**
 * The built-in SIGNAL VEIL demonstration: a deterministic, fictional 150-day
 * mission run through the Constellation Engine. Works offline with no setup.
 */
export function SignalVeilDemo({ standalone = false }: { standalone?: boolean }) {
  const dataset = useMemo(() => generateVeilMission(), [])
  const { analysis, ms } = useMemo(() => {
    const t0 = performance.now()
    const a = createMissionAnalysis(dataset, VEIL_ENGINE_CONFIG)
    return { analysis: a, ms: performance.now() - t0 }
  }, [dataset])
  const [userActions, setUserActions] = useState<RecordedAction[]>(loadActions)
  const [resetKey, setResetKey] = useState(0)
  const [progress, setProgress] = useState<ExperienceProgress | null>(null)

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
  const resetDemo = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setUserActions([])
    setProgress(null)
    setResetKey((k) => k + 1)
  }

  const done = progress ? STEPS.filter((s) => progress[s.key]).length : 0
  // `?fog=2d` forces the Canvas 2D fog renderer, for devices without WebGL2 or for testing the fallback.
  const forceCanvas2D = useMemo(() => new URLSearchParams(window.location.search).get('fog') === '2d', [])

  return (
    <div>
      <header className="reveal mb-6">
        <div className="mb-3.5 flex items-center gap-3">
          <span className="eyebrow">Signature instrument</span>
          <span className="h-px flex-1 bg-border" />
          <ProvenanceTag provenance="synthetic-demo" />
          <span className="annotate">PLATE SV</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="max-w-2xl">
            <h1 className="display text-[clamp(2rem,4.4vw,3.1rem)]">Signal Veil</h1>
            <p className="display-italic mt-1 text-lg text-text">Reveal the hidden patterns of astronaut health</p>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">
              A fogged visor hides a constellation of one crew member's health signals over a {dataset.totalDays}-day mission. Wipe it clear, then explore what the Constellation Engine found: several indicators that each changed only modestly, but changed together.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            {standalone && (
              <a href="./index.html" className="inline-flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface-2/60 px-3.5 text-[13px] text-text transition-colors hover:border-accent/55 hover:text-text-strong">
                <ArrowLeft className="h-3.5 w-3.5" /> AURORA
              </a>
            )}
            <Button variant="outline" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetDemo}>
              Reset demo
            </Button>
          </div>
        </div>
        <div className="mt-6 h-px w-full bg-border" />
      </header>

      <SignalVeilExperience
        key={resetKey}
        dataset={dataset}
        analysis={analysis}
        initialDay={START_DAY}
        forceCanvas2D={forceCanvas2D}
        userActions={userActions}
        onRecordAction={record}
        onRemoveAction={remove}
        onProgress={setProgress}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="panel rounded-md p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow text-text-strong">Demonstration path</h2>
            <span className="annotate">
              {done} / {STEPS.length}
            </span>
          </div>
          <ol className="mt-3 space-y-1.5">
            {STEPS.map((s, i) => {
              const ok = !!progress?.[s.key]
              return (
                <li key={s.key} className={`flex items-center gap-2.5 text-xs ${ok ? 'text-text-strong' : 'text-muted'}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border ${ok ? 'border-accent bg-accent/15 text-accent' : 'border-border-strong'}`}>
                    {ok ? <Check className="h-3 w-3" /> : <span className="mono text-[9px]">{i + 1}</span>}
                  </span>
                  {s.label}
                </li>
              )
            })}
          </ol>
        </section>

        <section className="panel rounded-md p-4">
          <h2 className="eyebrow text-text-strong">Where each number comes from</h2>
          <ul className="mt-3 space-y-2.5">
            {PROVENANCES.map(({ p, note }) => (
              <li key={p}>
                <ProvenanceTag provenance={p} />
                <p className="mt-1 text-[11.5px] leading-snug text-muted">{note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel rounded-md p-4">
          <h2 className="eyebrow text-text-strong">About this demonstration</h2>
          <dl className="mono mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
            <dt className="text-muted">Mission</dt>
            <dd className="text-text">{dataset.name} (fictional)</dd>
            <dt className="text-muted">Crew member</dt>
            <dd className="text-text">
              {dataset.subject.name} · {dataset.subject.id}
            </dd>
            <dt className="text-muted">Indicators</dt>
            <dd className="text-text">
              {dataset.indicators.length} in {dataset.categories.length} categories
            </dd>
            <dt className="text-muted">Engine run</dt>
            <dd className="text-text">{ms.toFixed(0)} ms, in this browser</dd>
            <dt className="text-muted">Network</dt>
            <dd className="text-text">none required</dd>
          </dl>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            The data is generated from a fixed seed, so every visitor sees the same mission. It contains planted day-to-day couplings and deliberately unrelated signals, so the relationship tests have both real associations and true negatives to find. No value is a real astronaut measurement, and nothing here is medical advice.
          </p>
        </section>
      </div>
    </div>
  )
}
