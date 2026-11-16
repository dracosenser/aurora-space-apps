import { useMemo, useState } from 'react'
import { Check, ChevronLeft } from 'lucide-react'
import { useMission, ASTRONAUTS } from '../../../hooks/useMission'
import {
  PROCEDURES_AT, baselineOf, nextProcStep, procComplete, procStepKey,
  type ProcContext, type Procedure,
} from '../model/procedures'
import type { StationId } from '../model/deck'
import type { TaskId } from '../model/objectives'

/**
 * The procedures a console can run.
 *
 * One component serves every console: which procedures appear is decided by
 * the station the panel is rendered in, so the medical bay offers the medical
 * ones and environmental control offers the water and atmosphere ones, from a
 * single list.
 *
 * Steps are performed one at a time and in order. A step's result comes from
 * the mission's own records for the selected crew member, so the numbers here
 * and the numbers on the charts are the same numbers.
 */
export function ProcedurePanel({
  at, done, onStep, onTask, evaDone, evaSeconds,
}: {
  at: StationId
  /** Completed step keys, qualified by procedure. */
  done: readonly string[]
  onStep: (key: string) => void
  onTask: (t: TaskId) => void
  evaDone: boolean
  evaSeconds: number
}) {
  const m = useMission()
  const [open, setOpen] = useState<Procedure | null>(null)
  const list = useMemo(() => PROCEDURES_AT(at), [at])

  const who = ASTRONAUTS.find((x) => x.id === m.selectedAstronautId) ?? ASTRONAUTS[0]
  const theirs = useMemo(
    () => m.visibleRecords.filter((r) => r.astronautId === who.id),
    [m.visibleRecords, who.id],
  )
  const ctx: ProcContext = useMemo(
    () => ({
      who,
      now: theirs[theirs.length - 1],
      base: baselineOf(theirs),
      day: m.viewDay,
      evaDone,
      evaSeconds,
    }),
    [who, theirs, m.viewDay, evaDone, evaSeconds],
  )

  if (list.length === 0) return null

  // ------------------------------------------------------------- one open
  if (open) {
    const blocked = open.requires?.(ctx) ?? null
    const next = nextProcStep(open, done)
    const complete = procComplete(open, done)
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setOpen(null)}
            className="mono flex items-center gap-1.5 border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/65 transition-colors hover:border-white/45 hover:text-white"
          >
            <ChevronLeft className="h-3 w-3" /> Back
          </button>
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">{open.code}</p>
            <p className="text-[15px] text-white/90">{open.title}</p>
          </div>
          <span className="annotate ml-auto text-white/35">{who.name} · MD {m.viewDay}</span>
        </div>

        <p className="mb-3 max-w-2xl text-[12.5px] leading-relaxed text-white/60">{open.brief}</p>

        {blocked ? (
          <p className="border border-amber-300/25 bg-amber-300/5 px-3 py-2.5 text-[12.5px] text-amber-200/90">
            {blocked}
          </p>
        ) : (
          <ol className="border border-white/10">
            {open.steps.map((s, i) => {
              const key = procStepKey(open.id, s.id)
              const on = done.includes(key)
              const isNext = next?.id === s.id
              return (
                <li
                  key={s.id}
                  className={`flex items-start gap-3 border-b border-white/8 px-3 py-2.5 last:border-b-0 ${on ? 'bg-white/[0.02]' : ''}`}
                >
                  <span
                    className={`mono mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border text-[9px] ${
                      on ? 'border-emerald-300/70 text-emerald-300/90' : isNext ? 'border-cyan-300/70 text-cyan-200' : 'border-white/20 text-white/35'
                    }`}
                  >
                    {on ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[12.5px] ${on ? 'text-white/85' : isNext ? 'text-white/90' : 'text-white/45'}`}>{s.label}</p>
                    {on && <p className="mt-1 text-[11.5px] leading-relaxed text-white/50">{s.read(ctx)}</p>}
                  </div>
                  {isNext && (
                    <button
                      onClick={() => {
                        onStep(key)
                        // Closing the last step closes the objective task too.
                        const after = [...done, key]
                        if (procComplete(open, after)) onTask(open.task)
                      }}
                      className="mono shrink-0 border border-cyan-300/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-300/10"
                    >
                      Perform
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        {complete && (
          <p className="mt-3 text-[12px] text-emerald-300/85">
            {open.code} complete and filed against mission day {m.viewDay}.
          </p>
        )}
        <p className="mono mt-3 text-[9.5px] uppercase tracking-[0.16em] text-white/30">
          Familiarisation exercise · synthetic data · not a clinical procedure
        </p>
      </div>
    )
  }

  // --------------------------------------------------------------- the list
  return (
    <div>
      <p className="mono mb-2 text-[10.5px] uppercase tracking-[0.18em] text-white/40">
        Procedures — select one to run it
      </p>
      <div className="grid gap-px bg-white/10 sm:grid-cols-2">
        {list.map((p) => {
          const complete = procComplete(p, done)
          const blocked = p.requires?.(ctx) ?? null
          const count = p.steps.filter((s) => done.includes(procStepKey(p.id, s.id))).length
          return (
            <button
              key={p.id}
              onClick={() => setOpen(p)}
              className="group bg-black/40 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="flex items-center gap-2">
                <span className="mono text-[9.5px] uppercase tracking-[0.18em] text-cyan-200/60">{p.code}</span>
                {complete && <Check className="h-3 w-3 text-emerald-300/80" />}
                {blocked && !complete && (
                  <span className="mono text-[9px] uppercase tracking-[0.16em] text-amber-200/60">locked</span>
                )}
                <span className="mono ml-auto text-[9.5px] text-white/30">
                  {count}/{p.steps.length}
                </span>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-white/85 group-hover:text-white">{p.title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-white/40">{p.brief}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
