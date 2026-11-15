import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Droplets, Eraser, Search, Table2 } from 'lucide-react'
import { createMissionAnalysis, type MissionAnalysis } from '../../engine/analysis'
import type { DeepPartial, EngineConfig } from '../../engine/config'
import type { MissionDataset, RecordedAction, RelationshipResult } from '../../engine/types'
import { STATUS_LABEL } from '../../engine/explain'
import { Button } from '../../components/ui/Button'
import { colorForCategory } from './model/layout'
import { buildSnapshot } from './model/snapshot'
import { AUTO_CLEAR_AT, BRUSH_RANGE, initialVeilState, veilReducer, type PanelId, type ReplayPlan } from './model/veilReducer'
import { SignalVeilCanvas, type LensTarget } from './SignalVeilCanvas'
import { DataTable } from './ui/DataTable'
import { HelmetFrame } from './ui/HelmetFrame'
import { InsightPanel } from './ui/InsightPanel'
import { NodeInspector } from './ui/NodeInspector'
import { RelationshipPanel } from './ui/RelationshipPanel'
import { ResponsePanel } from './ui/ResponsePanel'
import { TimelineController } from './ui/TimelineController'
import { MiniSpark } from './ui/charts'
import { ProvenanceTag, StatusBadge, num, signed } from './ui/shared'

/** What the visitor has done so far; used by the demonstration checklist. */
export interface ExperienceProgress {
  wiped: boolean
  cleared: boolean
  inspected: boolean
  connected: boolean
  foundSupported: boolean
  scrubbed: boolean
  replayed: boolean
  readFindings: boolean
  viewedResponse: boolean
}

export interface SignalVeilExperienceProps {
  /** Health records, indicator definitions, events and recorded actions. */
  dataset: MissionDataset
  /** Constellation Engine settings; defaults are used when omitted. */
  config?: DeepPartial<EngineConfig>
  /** Pass a prebuilt analysis to share it with the rest of the application. */
  analysis?: MissionAnalysis
  /** Mission day shown first. Defaults to the final day. */
  initialDay?: number
  /** Recorded actions in addition to those in the dataset (for example user-entered). */
  userActions?: readonly RecordedAction[]
  onRecordAction?: (action: RecordedAction) => void
  onRemoveAction?: (id: string) => void
  /** Skip the fog and show the constellation immediately. */
  startClear?: boolean
  /** Use the Canvas 2D fog renderer even when WebGL2 is available. */
  forceCanvas2D?: boolean
  onSelectIndicator?: (indicatorId: string | null) => void
  onSelectRelationship?: (result: RelationshipResult | null) => void
  onDayChange?: (day: number) => void
  onReplayChange?: (playing: boolean) => void
  /** Called after the visual interaction (fog, selection, drawn lines) is reset. */
  onReset?: () => void
  onProgress?: (progress: ExperienceProgress) => void
  className?: string
}

const TABS: { id: PanelId; label: string }[] = [
  { id: 'insights', label: 'Findings' },
  { id: 'signal', label: 'Signal' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'response', label: 'Response' },
]

const EMPTY_ACTIONS: readonly RecordedAction[] = []

/**
 * SIGNAL VEIL: the fogged visor, the health-signal constellation behind it,
 * the mission timeline and the evidence panels, wired to the Constellation
 * Engine. Self-contained: it needs a dataset and nothing else.
 */
export function SignalVeilExperience({
  dataset,
  config,
  analysis: providedAnalysis,
  initialDay,
  userActions = EMPTY_ACTIONS,
  onRecordAction,
  onRemoveAction,
  startClear = false,
  forceCanvas2D = false,
  onSelectIndicator,
  onSelectRelationship,
  onDayChange,
  onReplayChange,
  onReset,
  onProgress,
  className = '',
}: SignalVeilExperienceProps) {
  const analysis = useMemo(() => providedAnalysis ?? createMissionAnalysis(dataset, config), [providedAnalysis, dataset, config])
  const order = useMemo(() => dataset.indicators.map((i) => i.id), [dataset])
  const [state, dispatch] = useReducer(veilReducer, undefined, () => {
    const s = initialVeilState(dataset.totalDays, order, initialDay ?? dataset.totalDays)
    return startClear ? { ...s, fogRevealed: 1, fogCleared: true } : s
  })
  const [tableOpen, setTableOpen] = useState(false)
  const [lensTarget, setLensTarget] = useState<LensTarget | null>(null)
  const [renderer, setRenderer] = useState<'webgl2' | 'canvas2d' | null>(null)

  const actions = useMemo(() => [...dataset.actions, ...userActions], [dataset, userActions])
  const snapshot = useMemo(() => buildSnapshot(analysis, state.day, state.revealedLinks, actions), [analysis, state.day, state.revealedLinks, actions])
  const insights = useMemo(() => analysis.insightsAt(state.day, actions), [analysis, state.day, actions])

  const colors = useMemo(() => {
    const used = dataset.categories.filter((c) => dataset.indicators.some((i) => i.category === c.id))
    const map = new Map<string, string>()
    for (const ind of dataset.indicators) map.set(ind.id, colorForCategory(ind.category, Math.max(0, used.findIndex((c) => c.id === ind.category))))
    return map
  }, [dataset])
  const colorOf = (id: string) => colors.get(id) ?? '#7aa7ff'

  const replayPlan = useMemo<ReplayPlan | null>(() => {
    if (analysis.patternEpisodes.length === 0) return null
    const ep = [...analysis.patternEpisodes].sort((a, b) => b.patternDays.length - a.patternDays.length)[0]
    return { fromDay: Math.max(1, ep.startDay - 30), toDay: Math.min(dataset.totalDays, ep.detectedDay + 26), holdDay: ep.detectedDay, label: ep.id }
  }, [analysis, dataset])

  // ---- Playback clock. Replay pauses briefly on the day the engine reported the pattern.
  const dayRef = useRef(state.day)
  dayRef.current = state.day
  const replayRef = useRef(state.replay)
  replayRef.current = state.replay
  useEffect(() => {
    if (!state.playing) return
    let hold = 0
    let held = false
    const id = window.setInterval(() => {
      const r = replayRef.current
      if (r && r.holdDay === dayRef.current && !held) {
        held = true
        hold = Math.round(1.8 * state.speed)
      }
      if (hold > 0) {
        hold--
        return
      }
      dispatch({ type: 'tick', days: 1 })
    }, 1000 / state.speed)
    return () => window.clearInterval(id)
  }, [state.playing, state.speed])

  // ---- Warm the relationship cache in idle slices so scrubbing stays smooth.
  useEffect(() => {
    let next = dataset.totalDays
    let timer = 0
    const work = () => {
      const stop = Math.max(1, next - 5)
      for (; next >= stop; next--) analysis.relationshipsAt(next)
      if (next >= 1) timer = window.setTimeout(work, 40)
    }
    timer = window.setTimeout(work, 600)
    return () => window.clearTimeout(timer)
  }, [analysis, dataset])

  // ---- Outward callbacks.
  const cb = useRef({ onSelectIndicator, onSelectRelationship, onDayChange, onReplayChange, onProgress })
  cb.current = { onSelectIndicator, onSelectRelationship, onDayChange, onReplayChange, onProgress }
  // Each callback fires only when its value actually changes (StrictMode-safe).
  const seen = useRef({ day: state.day, playing: state.playing, selectedId: state.selectedId, connection: state.connection })
  useEffect(() => {
    if (seen.current.day === state.day) return
    seen.current.day = state.day
    cb.current.onDayChange?.(state.day)
  }, [state.day])
  useEffect(() => {
    if (seen.current.playing === state.playing) return
    seen.current.playing = state.playing
    cb.current.onReplayChange?.(state.playing)
  }, [state.playing])
  useEffect(() => {
    if (seen.current.selectedId === state.selectedId) return
    seen.current.selectedId = state.selectedId
    cb.current.onSelectIndicator?.(state.selectedId)
  }, [state.selectedId])
  useEffect(() => {
    if (seen.current.connection === state.connection) return
    seen.current.connection = state.connection
    cb.current.onSelectRelationship?.(state.connection ? (analysis.relationshipBetween(state.connection.a, state.connection.b, dayRef.current) ?? null) : null)
  }, [state.connection, analysis])

  const progress = useRef<ExperienceProgress>({ wiped: startClear, cleared: startClear, inspected: false, connected: false, foundSupported: false, scrubbed: false, replayed: false, readFindings: false, viewedResponse: false })
  const userScrubbed = useRef(false)
  useEffect(() => {
    const p = progress.current
    const next: ExperienceProgress = {
      wiped: p.wiped || state.fogRevealed > 0.2 || state.fogCleared,
      cleared: p.cleared || state.fogCleared,
      inspected: p.inspected || state.selectedId !== null,
      connected: p.connected || state.revealedLinks.length > 0,
      foundSupported: p.foundSupported || snapshot.supportedFound > 0,
      scrubbed: p.scrubbed || userScrubbed.current,
      replayed: p.replayed || state.replay !== null,
      readFindings: p.readFindings || (state.fogCleared && state.panel === 'insights' && !startClear),
      viewedResponse: p.viewedResponse || state.panel === 'response',
    }
    if (JSON.stringify(next) !== JSON.stringify(p)) {
      progress.current = next
      cb.current.onProgress?.(next)
    }
  }, [state, snapshot.supportedFound, startClear])

  const setDay = (day: number) => {
    userScrubbed.current = true
    dispatch({ type: 'set-day', day })
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return
    if (e.key === 'l' || e.key === 'L') dispatch({ type: 'toggle-lens' })
    else if (e.key === 'p' || e.key === 'P') dispatch({ type: 'toggle-play' })
    else if (e.key === 'ArrowLeft') {
      userScrubbed.current = true
      dispatch({ type: 'step', delta: -1 })
    } else if (e.key === 'ArrowRight') {
      userScrubbed.current = true
      dispatch({ type: 'step', delta: 1 })
    } else if (e.key === 'Escape') {
      dispatch({ type: 'select', id: null })
      dispatch({ type: 'clear-connection' })
      dispatch({ type: 'set-lens', on: false })
    } else return
    e.preventDefault()
  }

  const fogProgressPct = Math.min(100, Math.round((state.fogRevealed / AUTO_CLEAR_AT) * 100))
  const instructionOpacity = state.fogCleared ? 0 : 1 - Math.min(1, state.fogRevealed / 0.4) * 0.8
  const lensNode = lensTarget?.id ? analysis.timelineOf(lensTarget.id) : null
  const lensState = lensNode ? lensNode.states[state.day - 1] : null
  const brushFill = ((state.brush - BRUSH_RANGE[0]) / (BRUSH_RANGE[1] - BRUSH_RANGE[0])) * 100
  const activeFindings = insights.filter((i) => i.kind !== 'normal-variation' && i.active).length

  return (
    <div className={className} onKeyDown={onKeyDown}>
      {/* ---------------------------------------------------------- toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2.5">
          <span className="eyebrow-sm">Brush</span>
          <input
            type="range"
            min={BRUSH_RANGE[0]}
            max={BRUSH_RANGE[1]}
            step={4}
            value={state.brush}
            onChange={(e) => dispatch({ type: 'set-brush', brush: parseInt(e.target.value, 10) })}
            className="w-28"
            style={{ ['--fill' as string]: `${brushFill}%` }}
            aria-label="Brush radius"
            disabled={state.fogCleared}
          />
          <span className="mono w-10 text-[11px] text-muted">{state.brush}px</span>
        </label>
        {state.fogCleared ? (
          <Button size="sm" variant="outline" icon={<Droplets className="h-3.5 w-3.5" />} onClick={() => dispatch({ type: 'fog-reset' })}>
            Fog the visor again
          </Button>
        ) : (
          <Button size="sm" variant="outline" icon={<Eraser className="h-3.5 w-3.5" />} onClick={() => dispatch({ type: 'fog-clear' })}>
            Clear all fog
          </Button>
        )}
        <Button size="sm" variant={state.lens ? 'primary' : 'outline'} icon={<Search className="h-3.5 w-3.5" />} onClick={() => dispatch({ type: 'toggle-lens' })} aria-pressed={state.lens} title="Data lens (L)">
          Data lens
        </Button>
        <Button size="sm" variant={tableOpen ? 'primary' : 'ghost'} icon={<Table2 className="h-3.5 w-3.5" />} onClick={() => setTableOpen((v) => !v)} aria-pressed={tableOpen}>
          Data table
        </Button>
        <span className="annotate ml-auto hidden md:inline">
          {renderer === 'webgl2' ? 'PROCEDURAL FOG · WEBGL2 SHADER' : renderer === 'canvas2d' ? 'PROCEDURAL FOG · CANVAS 2D FALLBACK' : ''} · L LENS · P PLAY · ← → DAY
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* ----------------------------------------------------- the visor */}
        <div className="min-w-0 xl:col-span-8">
          <HelmetFrame
            top={
              <>
                <p className="eyebrow-sm" style={{ color: 'rgba(170,188,220,0.85)' }}>
                  Helmet view · {dataset.subject.name} · {dataset.subject.role} · Day {String(state.day).padStart(3, '0')}
                </p>
                <ProvenanceTag provenance={dataset.provenance} />
              </>
            }
            bottom={
              <>
                <p className="annotate" style={{ color: 'rgba(150,170,205,0.85)' }}>
                  {!state.fogCleared
                    ? 'YOUR BREATH HAS FOGGED THE VISOR · DRAG TO WIPE IT WITH YOUR GLOVE'
                    : state.lens
                      ? 'DATA LENS ON · MOVE OVER THE VISOR'
                      : 'CLICK A SIGNAL TO INSPECT · DRAG BETWEEN TWO SIGNALS TO TEST A RELATIONSHIP'}
                </p>
                {state.fogCleared && (
                  <p className="annotate" style={{ color: 'rgba(150,170,205,0.85)' }}>
                    {snapshot.counts.sustained} SUSTAINED · {snapshot.counts.unusual + snapshot.counts.drifting} CHANGING · {snapshot.counts.normal} ORDINARY
                    {snapshot.counts.stale + snapshot.counts['insufficient-data'] > 0 ? ` · ${snapshot.counts.stale + snapshot.counts['insufficient-data']} NO DATA` : ''}
                  </p>
                )}
              </>
            }
          >
              <SignalVeilCanvas
                className="h-[min(68vh,660px)] min-h-[430px] w-full"
                indicators={dataset.indicators}
                categories={dataset.categories}
                snapshot={snapshot}
                selectedId={state.selectedId}
                connection={state.connection}
                lens={state.lens}
                brush={state.brush}
                fogEpoch={state.fogEpoch}
                clearEpoch={state.clearEpoch}
                startClear={startClear}
                forceCanvas2D={forceCanvas2D}
                onSelect={(id) => dispatch({ type: 'select', id })}
                onConnect={(a, b) => dispatch({ type: 'connect', a, b })}
                onFogProgress={(revealed) => dispatch({ type: 'fog-progress', revealed })}
                onLensTarget={setLensTarget}
                onRenderer={setRenderer}
              />

              {/* The invitation */}
              {!state.fogCleared && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center px-[14%] pb-[9%] text-center transition-opacity duration-500" style={{ opacity: instructionOpacity }}>
                  <p className="display-italic text-[clamp(1.25rem,2.6vw,1.9rem)]" style={{ color: 'rgba(240,245,252,0.95)', textShadow: '0 1px 24px rgba(2,4,10,0.9)' }}>
                    Your astronaut's health tells a story.
                  </p>
                  <p className="display mt-1 text-[clamp(1.5rem,3.2vw,2.3rem)]" style={{ color: '#ffffff', textShadow: '0 1px 24px rgba(2,4,10,0.9)' }}>
                    Reveal the signals.
                  </p>
                  <p className="eyebrow mt-4" style={{ color: 'rgba(200,214,236,0.85)' }}>
                    You are inside the helmet · wipe the visor clear
                  </p>
                  <div className="mt-3 h-px w-40 overflow-hidden" style={{ background: 'rgba(200,214,236,0.25)' }}>
                    <div className="h-full" style={{ width: `${fogProgressPct}%`, background: 'rgba(240,245,252,0.9)', transition: 'width 0.2s ease' }} />
                  </div>
                </div>
              )}

              {state.replay && (
                <div className="pointer-events-none absolute inset-x-0 top-[15%] flex justify-center px-[16%]">
                  <p className="rounded-xs border border-ember/40 px-3 py-1.5 text-center text-xs" style={{ background: 'rgba(4,7,15,0.82)', color: '#eef3fa' }}>
                    <span className="eyebrow-sm mr-2 text-ember">Replay</span>
                    {snapshot.caption}
                  </p>
                </div>
              )}

              {/* Data lens readout */}
              {state.lens && lensTarget && (
                <div
                  className="pointer-events-none absolute w-56 rounded-sm border border-accent/40 p-3 shadow-2xl"
                  style={{
                    background: 'rgba(6,11,24,0.94)',
                    left: Math.max(8, Math.min(lensTarget.canvasWidth - 232, lensTarget.x + (lensTarget.x > lensTarget.canvasWidth * 0.6 ? -lensTarget.radius - 236 : lensTarget.radius + 12))),
                    top: Math.max(8, Math.min(lensTarget.canvasHeight - 190, lensTarget.y - 80)),
                  }}
                >
                  {lensNode && lensState ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(lensNode.def.id) }} />
                        <p className="eyebrow-sm" style={{ color: '#b9c6da' }}>
                          {lensNode.def.label}
                        </p>
                      </div>
                      <p className="mono mt-1.5 text-lg leading-none" style={{ color: '#eef3fa' }}>
                        {num(lensState.lastValue, lensNode.def.decimals)} <span className="text-[11px]" style={{ color: '#76859e' }}>{lensNode.def.unit}</span>
                      </p>
                      <dl className="mono mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px]" style={{ color: '#b9c6da' }}>
                        <dt style={{ color: '#76859e' }}>baseline</dt>
                        <dd className="text-right">{lensState.baseline && lensState.baseline.status !== 'insufficient' ? `${num(lensState.baseline.median, lensNode.def.decimals)} ± ${num(lensState.baseline.scale, 1)}` : '—'}</dd>
                        <dt style={{ color: '#76859e' }}>robust z</dt>
                        <dd className="text-right">{signed(lensState.z, 2)}</dd>
                        <dt style={{ color: '#76859e' }}>smoothed shift</dt>
                        <dd className="text-right">{signed(lensState.shift, 2)}</dd>
                        <dt style={{ color: '#76859e' }}>vs baseline</dt>
                        <dd className="text-right">{lensState.percentChange !== null ? `${signed(lensState.percentChange, 0)}%` : '—'}</dd>
                      </dl>
                      <div className="mt-2">
                        <MiniSpark values={lensNode.clean.slice(Math.max(0, state.day - 30), state.day)} color={colorOf(lensNode.def.id)} width={196} height={30} />
                        <p className="mono text-[9px]" style={{ color: '#76859e' }}>
                          last 30 days · {STATUS_LABEL[lensState.status].toLowerCase()}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] leading-snug" style={{ color: '#b9c6da' }}>
                      Move the lens over a signal to read its exact values.
                    </p>
                  )}
                </div>
              )}
          </HelmetFrame>

          <div className="mt-4">
            <TimelineController
              analysis={analysis}
              snapshot={snapshot}
              actions={actions}
              playing={state.playing}
              speed={state.speed}
              replay={state.replay}
              onDay={setDay}
              onStep={(delta) => {
                userScrubbed.current = true
                dispatch({ type: 'step', delta })
              }}
              onTogglePlay={() => dispatch({ type: 'toggle-play' })}
              onReset={() => dispatch({ type: 'reset-timeline' })}
              onSpeed={(speed) => dispatch({ type: 'set-speed', speed })}
              onReplay={() => {
                if (!replayPlan) return
                dispatch({ type: 'fog-clear' })
                dispatch({ type: 'start-replay', plan: replayPlan })
              }}
              onStopReplay={() => dispatch({ type: 'stop-replay' })}
            />
          </div>
        </div>

        {/* ---------------------------------------------------- evidence */}
        <aside className="min-w-0 xl:col-span-4">
          <div className="panel flex flex-col rounded-md xl:max-h-[calc(min(68vh,660px)+196px)] xl:min-h-[626px]">
            <div className="flex border-b border-border" role="tablist" aria-label="Evidence panels">
              {TABS.map((t) => {
                const active = state.panel === t.id
                const count = t.id === 'insights' ? activeFindings : t.id === 'relationship' ? snapshot.links.length : t.id === 'response' ? actions.filter((a) => a.day <= state.day).length : 0
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => dispatch({ type: 'set-panel', panel: t.id })}
                    className={`relative flex-1 px-2 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${active ? 'text-text-strong' : 'text-muted hover:text-text'}`}
                  >
                    {t.label}
                    {count > 0 && <span className="mono ml-1.5 text-[9px] text-accent">{count}</span>}
                    {active && <span className="absolute inset-x-3 bottom-0 h-px bg-accent" />}
                  </button>
                )
              })}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4" role="tabpanel">
              {state.panel === 'insights' && <InsightPanel insights={insights} day={state.day} colorOf={colorOf} onSelectIndicator={(id) => dispatch({ type: 'select', id })} />}

              {state.panel === 'signal' &&
                (state.selectedId ? (
                  <NodeInspector
                    analysis={analysis}
                    indicatorId={state.selectedId}
                    day={state.day}
                    color={colorOf(state.selectedId)}
                    actions={actions}
                    onPickDay={setDay}
                    onCompare={(other) => state.selectedId && dispatch({ type: 'connect', a: state.selectedId, b: other })}
                  />
                ) : (
                  <div>
                    <p className="eyebrow">Signals · day {state.day}</p>
                    <h3 className="display mt-1.5 text-[1.6rem]">Choose a signal</h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted">Click a signal on the visor, or pick one here, to see its measurements, personal baseline and history.</p>
                    <div className="mt-3 space-y-3">
                      {dataset.categories
                        .filter((c) => dataset.indicators.some((i) => i.category === c.id))
                        .map((c) => (
                          <div key={c.id}>
                            <p className="eyebrow-sm mb-1.5">{c.label}</p>
                            <ul className="space-y-1">
                              {dataset.indicators
                                .filter((i) => i.category === c.id)
                                .map((i) => {
                                  const n = snapshot.nodes[i.id]
                                  return (
                                    <li key={i.id}>
                                      <button onClick={() => dispatch({ type: 'select', id: i.id })} className="flex w-full items-center justify-between gap-2 rounded-xs border border-border bg-surface-2/60 px-2.5 py-2 text-left transition-colors hover:border-accent/50">
                                        <span className="flex min-w-0 items-center gap-2 text-xs text-text-strong">
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(i.id) }} />
                                          <span className="truncate">{i.label}</span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                          <span className="mono text-[11px] text-muted">
                                            {num(n.lastValue, i.decimals)} {i.unit}
                                          </span>
                                          <StatusBadge status={n.status} />
                                        </span>
                                      </button>
                                    </li>
                                  )
                                })}
                            </ul>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}

              {state.panel === 'relationship' && (
                <RelationshipPanel
                  analysis={analysis}
                  connection={state.connection}
                  day={state.day}
                  snapshot={snapshot}
                  colorOf={colorOf}
                  onPick={(a, b) => dispatch({ type: 'connect', a, b })}
                  onForget={() => dispatch({ type: 'forget-links' })}
                />
              )}

              {state.panel === 'response' && (
                <ResponsePanel analysis={analysis} day={state.day} actions={actions} colorOf={colorOf} onAdd={onRecordAction} onRemove={onRemoveAction} onPickDay={setDay} />
              )}
            </div>
          </div>
        </aside>
      </div>

      {tableOpen && (
        <div className="panel mt-4 rounded-md p-4">
          <DataTable analysis={analysis} snapshot={snapshot} onSelect={(id) => dispatch({ type: 'select', id })} onCompare={(a, b) => dispatch({ type: 'connect', a, b })} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dispatch({ type: 'reset-all', day: initialDay ?? dataset.totalDays })
            setLensTarget(null)
            onReset?.()
          }}
        >
          Reset the visual interaction
        </Button>
        <p className="text-[10.5px] leading-snug text-muted">
          Statuses describe departures from this person's own baseline. They are not diagnoses, and a baseline is not a statement of what is medically healthy.
        </p>
      </div>
    </div>
  )
}
