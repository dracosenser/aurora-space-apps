import { useMemo } from 'react'
import { Check, Lock, Unlock } from 'lucide-react'
import {
  CABIN_KPA, hatchOpenness, innerHatch, outerHatch, phaseProgress, refuse, statusLine,
  type Airlock, type AirlockCommand,
} from '../model/airlock'
import {
  CONSUMABLES, COMMS_LOOPS, DONNING, INSPECTION, STAGES, SUITS, TOOLS,
  nextDonning, prepComplete, stageOf, type CommsLoop, type ConsumableId, type DonningId,
  type InspectionId, type SuitPrep, type ToolId,
} from '../model/suit'
import { EVA_TASK_BY_ID, nextStep, stepKey, taskComplete, type EvaTask } from '../model/eva'

/**
 * The screens of the EVA system.
 *
 * All three read the same models the simulation runs on, rather than keeping
 * their own copies: the airlock panel's buttons are the state machine's
 * commands, the suit panel's stages are the suit model's gates, and the
 * worksite panel's steps are the task's steps. Nothing here can report a state
 * the simulation is not actually in.
 *
 * Every synthetic reading is labelled where it is shown, and the procedures
 * are described as compressed and simplified wherever a real duration or
 * pressure would otherwise be implied.
 */

const SIM_NOTE =
  'Simplified simulation for training familiarity. Durations are compressed and readings are synthetic.'

function Row({ children, done }: { children: React.ReactNode; done?: boolean }) {
  return (
    <div
      className={`flex items-start gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 ${
        done ? 'opacity-55' : ''
      }`}
    >
      {children}
    </div>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border text-[10px] ${
        on ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300' : 'border-border text-muted'
      }`}
    >
      {on ? <Check size={11} /> : ''}
    </span>
  )
}

function Btn({
  onClick, disabled, title, children, tone = 'normal',
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
  tone?: 'normal' | 'go' | 'warn'
}) {
  const t =
    tone === 'go'
      ? 'border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/10'
      : tone === 'warn'
        ? 'border-amber-500/50 text-amber-200 hover:bg-amber-500/10'
        : 'border-border text-fg hover:bg-fg/5'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`border px-2.5 py-1 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${t}`}
    >
      {children}
    </button>
  )
}

// ============================================================ suit preparation
export function SuitPanel({
  prep, onChange,
}: {
  prep: SuitPrep
  onChange: (next: SuitPrep) => void
}) {
  const stage = stageOf(prep)
  const suit = prep.selected ? SUITS.find((s) => s.id === prep.selected) ?? null : null

  const set = (patch: Partial<SuitPrep>) => onChange({ ...prep, ...patch })
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <p className="eyebrow-sm">Extravehicular suit preparation</p>
        <p className="mt-1 text-[12px] text-muted">{SIM_NOTE}</p>
        <div className="mt-2.5 flex items-center gap-1.5">
          {STAGES.map((s) => (
            <span
              key={s.id}
              title={s.label}
              className={`h-1 flex-1 ${s.need(prep) ? 'bg-emerald-500/70' : s.id === stage ? 'bg-amber-500/70' : 'bg-border'}`}
            />
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ---- select */}
        <section className="border-b border-border">
          <h3 className="px-3 pt-3 text-[11px] uppercase tracking-wider text-muted">1 · Select a suit</h3>
          <div className="px-3 pb-3 pt-2">
            {SUITS.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={!s.serviceable}
                onClick={() => set({ selected: s.id })}
                className={`mb-1.5 block w-full border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  prep.selected === s.id ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-border hover:bg-fg/5'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-[12.5px] text-fg">{s.marking}</span>
                  <span className="text-[11px] text-muted">{s.size}</span>
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{s.note}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ---- inspect */}
        <section className="border-b border-border">
          <h3 className="px-3 pt-3 text-[11px] uppercase tracking-wider text-muted">
            2 · Inspect the suit · {prep.inspected.length}/{INSPECTION.length}
          </h3>
          <div className="pb-2 pt-1">
            {INSPECTION.map((p) => {
              const on = prep.inspected.includes(p.id)
              return (
                <Row key={p.id} done={on}>
                  <Tick on={on} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-fg">{p.label}</p>
                    <p className="text-[11px] text-muted">{on ? p.finding : p.looksFor}</p>
                  </div>
                  {!on && (
                    <Btn
                      onClick={() => set({ inspected: toggle(prep.inspected, p.id) as InspectionId[] })}
                      disabled={!suit}
                    >
                      Inspect
                    </Btn>
                  )}
                </Row>
              )
            })}
          </div>
        </section>

        {/* ---- life support */}
        <section className="border-b border-border">
          <h3 className="px-3 pt-3 text-[11px] uppercase tracking-wider text-muted">
            3 · Life support · {prep.acknowledged.length}/{CONSUMABLES.length}
          </h3>
          <div className="pb-2 pt-1">
            {CONSUMABLES.map((c) => {
              const on = prep.acknowledged.includes(c.id)
              return (
                <Row key={c.id} done={on}>
                  <Tick on={on} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-fg">{c.label}</p>
                    <p className="text-[11px] text-muted">{c.value} · synthetic</p>
                  </div>
                  {!on && (
                    <Btn
                      onClick={() => set({ acknowledged: toggle(prep.acknowledged, c.id) as ConsumableId[] })}
                      disabled={prep.inspected.length < INSPECTION.length}
                    >
                      Check
                    </Btn>
                  )}
                </Row>
              )
            })}
          </div>
        </section>

        {/* ---- comms */}
        <section className="border-b border-border px-3 py-3">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">4 · Communications</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMS_LOOPS.map((l) => (
              <Btn
                key={l}
                onClick={() => set({ comms: l as CommsLoop })}
                tone={prep.comms === l ? 'go' : 'normal'}
              >
                {l}
              </Btn>
            ))}
          </div>
          {prep.comms && <p className="mt-2 text-[11px] text-muted">Loop check complete on {prep.comms}. Synthetic.</p>}
        </section>

        {/* ---- tether and tools */}
        <section className="border-b border-border px-3 py-3">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">5 · Tether and tools</h3>
          <div className="mt-2">
            <Btn onClick={() => set({ tetherAttached: !prep.tetherAttached })} tone={prep.tetherAttached ? 'go' : 'warn'}>
              {prep.tetherAttached ? 'Safety tether attached' : 'Attach the safety tether'}
            </Btn>
          </div>
          <p className="mt-2.5 text-[11px] text-muted">
            Take what the worksites need. A step that calls for a tool you did not bring cannot be done outside.
          </p>
          <div className="mt-1.5">
            {TOOLS.map((t) => {
              const on = prep.tools.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set({ tools: toggle(prep.tools, t.id) as ToolId[] })}
                  className={`mb-1 block w-full border px-2.5 py-1.5 text-left transition-colors ${
                    on ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-border hover:bg-fg/5'
                  }`}
                >
                  <span className="text-[12px] text-fg">{t.label}</span>
                  <span className="block text-[11px] text-muted">{t.why}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ---- donning */}
        <section className="px-0 py-0">
          <h3 className="px-3 pt-3 text-[11px] uppercase tracking-wider text-muted">
            6 · Donning · {prep.donned.length}/{DONNING.length}
          </h3>
          <p className="px-3 pt-1 text-[11px] text-muted">
            In order. The garment cannot be assembled any other way.
          </p>
          <div className="pb-3 pt-1">
            {DONNING.map((d) => {
              const on = prep.donned.includes(d.id)
              const isNext = nextDonning(prep) === d.id
              return (
                <Row key={d.id} done={on}>
                  <Tick on={on} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-fg">{d.label}</p>
                    <p className="text-[11px] text-muted">{d.detail}</p>
                  </div>
                  {isNext && (
                    <Btn
                      tone="go"
                      disabled={stage !== 'donning'}
                      title={stage !== 'donning' ? 'Earlier stages are not complete.' : undefined}
                      onClick={() => set({ donned: [...prep.donned, d.id as DonningId] })}
                    >
                      Don
                    </Btn>
                  )}
                </Row>
              )
            })}
          </div>
        </section>
      </div>

      <footer className="border-t border-border px-4 py-2.5">
        {prepComplete(prep) ? (
          <p className="text-[12px] text-emerald-300">
            Suit {suit?.marking} ready. Go to airlock control to begin the egress sequence.
          </p>
        ) : (
          <p className="text-[12px] text-muted">
            Next: {STAGES.find((s) => s.id === stage)?.hint ?? ''}
          </p>
        )}
      </footer>
    </div>
  )
}

// ================================================================= airlock
export function AirlockPanel({
  airlock, ready, onCommand,
}: {
  airlock: Airlock
  ready: boolean
  onCommand: (c: AirlockCommand) => void
}) {
  const inner = innerHatch(airlock.state)
  const outer = outerHatch(airlock.state)
  const open = hatchOpenness(airlock)
  const prog = phaseProgress(airlock)

  const COMMANDS: { c: AirlockCommand; label: string; tone?: 'go' | 'warn' }[] = [
    { c: 'enter', label: 'Open the inner hatch' },
    { c: 'close-inner', label: 'Close and lock the inner hatch' },
    { c: 'confirm-suit', label: 'Confirm final suit check' },
    { c: 'begin-prebreathe', label: 'Begin denitrogenation' },
    { c: 'begin-depress', label: 'Begin depressurisation', tone: 'warn' },
    { c: 'open-outer', label: 'Unlock the outer hatch', tone: 'warn' },
    { c: 'egress', label: 'Egress', tone: 'go' },
    { c: 'close-outer', label: 'Close the outer hatch' },
    { c: 'open-inner', label: 'Unlock the inner hatch' },
    { c: 'ingress', label: 'Return to the station', tone: 'go' },
    { c: 'finish', label: 'Close out the spacewalk' },
  ]
  const live = COMMANDS.filter((x) => refuse(airlock, x.c, ready) === null)
  const blockedNext = COMMANDS.find((x) => refuse(airlock, x.c, ready) !== null && x.c !== 'enter')

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <p className="eyebrow-sm">Airlock control</p>
        <p className="mt-1 text-[12.5px] text-fg">{statusLine(airlock)}</p>
        <p className="mt-1 text-[11px] text-muted">{SIM_NOTE}</p>
      </header>

      {/* pressure */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted">Chamber pressure</span>
          <span className="font-mono text-[13px] text-fg">{airlock.kpa.toFixed(1)} kPa</span>
        </div>
        <div className="mt-2 h-2 w-full border border-border">
          <div
            className="h-full bg-sky-400/60 transition-[width] duration-200"
            style={{ width: `${Math.max(0, Math.min(100, (airlock.kpa / CABIN_KPA) * 100))}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] text-muted">
          <span>vacuum</span>
          <span>station · {CABIN_KPA} kPa</span>
        </div>
        {prog > 0 && (
          <div className="mt-2.5">
            <div className="h-1 w-full border border-border">
              <div className="h-full bg-amber-400/70" style={{ width: `${prog * 100}%` }} />
            </div>
            <p className="mt-1 text-[10.5px] text-muted">Sequence in progress · compressed timescale</p>
          </div>
        )}
      </div>

      {/* hatches */}
      <div className="grid grid-cols-2 border-b border-border">
        {([['Inner hatch', inner, open.inner], ['Outer hatch', outer, open.outer]] as const).map(([label, st, k]) => (
          <div key={label} className="border-r border-border px-4 py-3 last:border-r-0">
            <div className="flex items-center gap-1.5">
              {st === 'locked' ? <Lock size={12} className="text-amber-300" /> : <Unlock size={12} className="text-emerald-300" />}
              <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
            </div>
            <p className="mt-1 text-[12.5px] capitalize text-fg">{st}</p>
            <div className="mt-1.5 h-1 w-full border border-border">
              <div className="h-full bg-fg/40" style={{ width: `${k * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* commands */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">Available now</p>
        <div className="mt-2 flex flex-col items-start gap-1.5">
          {live.length === 0 && <p className="text-[12px] text-muted">Sequence running. Nothing to do but watch it.</p>}
          {live.map((x) => (
            <Btn key={x.c} tone={x.tone} onClick={() => onCommand(x.c)}>
              {x.label}
            </Btn>
          ))}
        </div>
        {airlock.refusal && <p className="mt-3 text-[12px] text-amber-300">{airlock.refusal}</p>}
        {!airlock.refusal && blockedNext && (
          <p className="mt-3 text-[11.5px] text-muted">{refuse(airlock, blockedNext.c, ready)}</p>
        )}
        {!ready && (
          <p className="mt-3 text-[11.5px] text-amber-300">
            Suit preparation is not complete. The inner hatch will not seal until it is.
          </p>
        )}
      </div>
    </div>
  )
}

// =============================================================== worksite
export function WorksitePanel({
  task, done, tools, onStep,
}: {
  task: EvaTask
  done: readonly string[]
  tools: readonly ToolId[]
  onStep: (key: string) => void
}) {
  const step = nextStep(task, done)
  const complete = taskComplete(task, done)
  const missing = step?.needs && !tools.includes(step.needs) ? step.needs : null
  const toolName = useMemo(() => Object.fromEntries(TOOLS.map((t) => [t.id, t.label])), [])

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <p className="eyebrow-sm">
          {task.code} · {task.title}
        </p>
        <p className="mt-1 text-[12px] text-muted">{task.site.label}</p>
        <p className="mt-2 text-[12.5px] text-fg">{task.brief}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {task.steps.map((s) => {
          const key = stepKey(task.id, s.id)
          const on = done.includes(key)
          const isNext = step?.id === s.id
          return (
            <Row key={s.id} done={on}>
              <Tick on={on} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-fg">{s.label}</p>
                {on && <p className="text-[11px] text-muted">{s.result}</p>}
                {!on && s.needs && (
                  <p className="text-[11px] text-muted">Needs the {toolName[s.needs]?.toLowerCase()}.</p>
                )}
              </div>
              {isNext && (
                <Btn
                  tone={missing ? 'warn' : 'go'}
                  disabled={!!missing}
                  title={missing ? `You did not bring the ${toolName[missing]?.toLowerCase()}.` : undefined}
                  onClick={() => onStep(key)}
                >
                  {missing ? 'No tool' : 'Perform'}
                </Btn>
              )}
            </Row>
          )
        })}
      </div>

      <footer className="border-t border-border px-4 py-2.5">
        {complete ? (
          <p className="text-[12px] text-emerald-300">{task.code} complete. Logged to the mission record.</p>
        ) : missing ? (
          <p className="text-[12px] text-amber-300">
            This step needs the {toolName[missing]?.toLowerCase()}, which is not on your tether. Finish what you
            can, then collect it on the next excursion.
          </p>
        ) : (
          <p className="text-[12px] text-muted">Steps are performed in order.</p>
        )}
      </footer>
    </div>
  )
}

/** The post-EVA summary, shown once a crew member is back inside. */
export function PostEvaPanel({
  seconds, steps, onReview,
}: {
  seconds: number
  steps: readonly string[]
  onReview: () => void
}) {
  const tasks = Object.values(EVA_TASK_BY_ID)
  const completed = tasks.filter((t) => taskComplete(t, steps))
  const mm = Math.floor(seconds / 60)
  const ss = Math.floor(seconds % 60)
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <p className="eyebrow-sm">Spacewalk complete</p>
        <p className="mt-1 text-[12.5px] text-fg">
          Time outside {mm}:{String(ss).padStart(2, '0')} · compressed timescale
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">Maintenance record</p>
        <ul className="mt-2 space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-[12.5px]">
              <Tick on={taskComplete(t, steps)} />
              <span className={taskComplete(t, steps) ? 'text-fg' : 'text-muted'}>
                {t.code} · {t.title}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] text-muted">
          {completed.length} of {tasks.length} exterior tasks closed out. A post-EVA assessment is available at the
          medical console, comparing the crew member's readings before and after the excursion.
        </p>
        <div className="mt-3">
          <Btn tone="go" onClick={onReview}>
            Open the post-EVA assessment
          </Btn>
        </div>
      </div>
    </div>
  )
}
