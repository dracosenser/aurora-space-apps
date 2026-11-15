import { useMemo, useState } from 'react'
import { ClipboardPlus, Trash2 } from 'lucide-react'
import type { MissionAnalysis } from '../../../engine/analysis'
import type { RecordedAction, ResponseClassification, ResponseStatus } from '../../../engine/types'
import { Badge, type Tone } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Checkbox } from '../../../components/ui/Controls'
import { BeforeAfterStrip } from './charts'
import { Bullets, ProvenanceTag, Section, num, signed } from './shared'

const STATUS_LABEL: Record<ResponseStatus, string> = {
  'awaiting-data': 'Awaiting follow-up data',
  'limited-data': 'Follow-up still open',
  evaluated: 'Follow-up complete',
}

const CLASS_LABEL: Record<ResponseClassification, string> = {
  'moved-toward-baseline': 'closer to baseline',
  'moved-away-from-baseline': 'further from baseline',
  'no-clear-change': 'no clear change',
  'near-baseline-before': 'already near baseline',
  'insufficient-data': 'insufficient data',
}

const CLASS_TONE: Record<ResponseClassification, Tone> = {
  'moved-toward-baseline': 'accent',
  'moved-away-from-baseline': 'ember',
  'no-clear-change': 'neutral',
  'near-baseline-before': 'neutral',
  'insufficient-data': 'neutral',
}

/** Descriptive labels only. AURORA records what was done; it does not recommend actions. */
const ACTION_PRESETS: { label: string; protocol: string; targets: string[] }[] = [
  { label: 'Sleep-schedule protocol step completed', protocol: 'Crew-recorded: sleep-schedule protocol', targets: ['sleepDuration', 'sleepQuality', 'fatigue'] },
  { label: 'Exercise countermeasure block completed', protocol: 'Crew-recorded: exercise countermeasure protocol', targets: ['exerciseMinutes', 'muscleStrength', 'restingHR'] },
  { label: 'Workload or timeline adjustment recorded', protocol: 'Crew-recorded: timeline adjustment', targets: ['fatigue', 'mood', 'sleepDuration'] },
  { label: 'Other protocol action', protocol: 'Crew-recorded: other approved protocol', targets: [] },
]

/**
 * Countermeasure response tracking: what the measurements did before and after
 * an action the crew member recorded. The comparison is descriptive and never
 * attributes a change to the action.
 */
export function ResponsePanel({
  analysis,
  day,
  actions,
  colorOf,
  onAdd,
  onRemove,
  onPickDay,
}: {
  analysis: MissionAnalysis
  day: number
  actions: readonly RecordedAction[]
  colorOf: (id: string) => string
  onAdd?: (action: RecordedAction) => void
  onRemove?: (id: string) => void
  onPickDay: (day: number) => void
}) {
  const sorted = useMemo(() => [...actions].sort((a, b) => a.day - b.day), [actions])
  const available = analysis.indicators.map((i) => i.id)
  const [preset, setPreset] = useState(0)
  const [targets, setTargets] = useState<string[]>(ACTION_PRESETS[0].targets.filter((t) => available.includes(t)))
  const [formOpen, setFormOpen] = useState(false)
  const def = (id: string) => analysis.timelineOf(id).def

  const choosePreset = (i: number) => {
    setPreset(i)
    setTargets(ACTION_PRESETS[i].targets.filter((t) => available.includes(t)))
  }

  const submit = () => {
    if (!onAdd || targets.length === 0) return
    const p = ACTION_PRESETS[preset]
    onAdd({ id: `user-${Date.now().toString(36)}`, day, label: p.label, protocol: p.protocol, targetIndicators: targets, provenance: 'user-entered', notes: 'Entered in the demonstration.' })
    setFormOpen(false)
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="eyebrow">Response tracking · day {day}</p>
        <h3 className="display mt-1.5 text-[1.6rem]">After a recorded action</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          When a crew member logs an action completed under an approved mission protocol, the engine compares measurements before and after it. It reports what changed and what else was happening. It does not recommend actions and cannot say an action caused a change.
        </p>
      </header>

      {sorted.length === 0 && <p className="text-xs text-muted">No actions have been recorded.</p>}

      {sorted.map((action) => {
        if (action.day > day) {
          return (
            <div key={action.id} className="rounded-sm border border-dashed border-border px-3 py-2.5">
              <p className="text-xs text-muted">
                An action is recorded on day {action.day}, later than the selected day.{' '}
                <button className="text-accent hover:underline" onClick={() => onPickDay(Math.min(analysis.dataset.totalDays, action.day + analysis.config.response.postDays))}>
                  Go to its follow-up
                </button>
              </p>
            </div>
          )
        }
        const r = analysis.responseFor(action, day, actions)
        const shown = r.indicators.filter((i) => i.isTarget || i.classification === 'moved-toward-baseline' || i.classification === 'moved-away-from-baseline')
        return (
          <article key={action.id} className="rounded-sm border border-border bg-surface-2/50">
            <div className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={r.status === 'evaluated' ? 'accent' : 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
                <ProvenanceTag provenance={action.provenance} />
                {action.provenance === 'user-entered' && onRemove && (
                  <button className="ml-auto rounded-xs p-1 text-muted hover:text-text-strong" onClick={() => onRemove(action.id)} aria-label={`Remove recorded action: ${action.label}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[13px] font-medium leading-snug text-text-strong">{action.label}</p>
              <p className="annotate mt-0.5">
                day {action.day} · {action.protocol}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-text">{r.summary}</p>
            </div>

            {r.status !== 'awaiting-data' && (
              <div className="space-y-3 border-t border-border px-3 py-3">
                <p className="annotate">
                  before: days {r.preWindow[0]}–{r.preWindow[1]} · after: days {r.postWindow[0]}–{r.postWindow[1]} ({r.postDaysElapsed} of {r.postDaysPlanned})
                </p>
                {shown.map((i) => {
                  const d = def(i.indicatorId)
                  return (
                    <div key={i.indicatorId}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11.5px] text-text-strong">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(i.indicatorId) }} />
                          {d.label}
                          {!i.isTarget && <span className="text-[10px] text-muted">(not designated)</span>}
                        </span>
                        <Badge tone={CLASS_TONE[i.classification]}>{CLASS_LABEL[i.classification]}</Badge>
                      </div>
                      {i.classification !== 'insufficient-data' ? (
                        <>
                          <BeforeAfterStrip analysis={analysis} result={i} actionDay={action.day} preWindow={r.preWindow} postWindow={r.postWindow} color={colorOf(i.indicatorId)} />
                          <p className="mono text-[10.5px] leading-snug text-muted">
                            median {num(i.medianPre, d.decimals)} → {num(i.medianPost, d.decimals)} {d.unit} · baseline {num(i.baselineMedian, d.decimals)} · distance from baseline {num(Math.abs(i.zPre ?? 0), 2)} → {num(Math.abs(i.zPost ?? 0), 2)} SD ({signed(-(i.distanceChange ?? 0), 2)}) · p {i.pValue !== null && i.pValue < 0.001 ? '< 0.001' : num(i.pValue, 3)} · n {i.nPre}/{i.nPost}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-[10.5px] text-muted">
                          {i.nPre} observation{i.nPre === 1 ? '' : 's'} before and {i.nPost} after; too few to compare.
                        </p>
                      )}
                    </div>
                  )
                })}

                {r.confounders.length > 0 && (
                  <div>
                    <p className="eyebrow-sm mb-1.5">Also happening in these windows</p>
                    <ul className="space-y-1.5">
                      {r.confounders.map((c, k) => (
                        <li key={`${c.kind}-${c.day}-${k}`} className="rounded-xs border border-border bg-surface/70 px-2.5 py-1.5">
                          <p className="text-[11.5px] text-text-strong">{c.label}</p>
                          <p className="text-[10.5px] leading-snug text-muted">{c.detail}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <details className="text-[11.5px] text-muted">
                  <summary className="eyebrow-sm cursor-pointer">Why this cannot show cause</summary>
                  <div className="mt-2">
                    <Bullets items={r.limitations} />
                  </div>
                </details>
              </div>
            )}
          </article>
        )
      })}

      {onAdd && (
        <Section title="Record an action" note={`on day ${day}`}>
          {!formOpen ? (
            <Button size="sm" variant="outline" icon={<ClipboardPlus className="h-3.5 w-3.5" />} onClick={() => setFormOpen(true)}>
              Record a completed protocol action
            </Button>
          ) : (
            <div className="space-y-3 rounded-sm border border-border bg-surface-2/50 p-3">
              <label className="block text-[11.5px] text-muted">
                What was completed
                <select className="mt-1.5 h-9 w-full rounded-sm border border-border-strong bg-surface-2/70 px-2.5 text-sm text-text-strong outline-none focus:border-accent" value={preset} onChange={(e) => choosePreset(parseInt(e.target.value, 10))}>
                  {ACTION_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="text-[11.5px] text-muted">Indicators the protocol designates for follow-up</legend>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {analysis.indicators.map((i) => (
                    <Checkbox key={i.id} checked={targets.includes(i.id)} color={colorOf(i.id)} label={<span className="text-[11.5px]">{i.shortLabel}</span>} onChange={(v) => setTargets((t) => (v ? [...t, i.id] : t.filter((x) => x !== i.id)))} />
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={submit} disabled={targets.length === 0}>
                  Record on day {day}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <p className="mt-2 text-[10.5px] leading-snug text-muted">
            Entries you add are stored in this browser and labelled user-entered. The follow-up uses whatever measurements exist after the day you choose.
          </p>
        </Section>
      )}
    </div>
  )
}
