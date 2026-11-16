import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Misc'
import { WORKSPACE_CATEGORIES } from '../../workspace/catalog'
import { addIndicator, removeIndicator, setIndicatorEnabled, setMission, setReading } from '../../workspace/ops'
import { ENV_SUBJECT, type Workspace } from '../../workspace/types'
import { ProvenanceTag } from '../signal-veil/ui/shared'
import { Field, INPUT, NumberCell, Panel, type Update } from './shared'

const ROWS = 10

/**
 * The entry grid: one row per mission day, one column per indicator, for a
 * crew member or for the shared space conditions. Type a number and leave the
 * cell to save it; clear the cell to delete it.
 */
export function DataEntry({ ws, update, subject, onSubject }: { ws: Workspace; update: Update; subject: string; onSubject: (s: string) => void }) {
  const isEnv = subject === ENV_SUBJECT
  const [endDay, setEndDay] = useState(ws.mission.currentDay)
  const [custom, setCustom] = useState({ label: '', unit: '', min: '', max: '', decimals: 1, weekly: false })

  // Follow the mission forward when a new day is opened or data is imported.
  useEffect(() => setEndDay((d) => (d > ws.mission.currentDay ? ws.mission.currentDay : d)), [ws.mission.currentDay])

  const scope = isEnv ? 'environment' : 'crew'
  const all = useMemo(() => ws.indicators.filter((i) => i.scope === scope), [ws.indicators, scope])
  const columns = all.filter((i) => i.enabled)
  const days: number[] = []
  for (let d = endDay; d >= Math.max(1, endDay - ROWS + 1); d--) days.push(d)
  const series = ws.readings[subject] ?? {}
  const provenances = [...new Set(columns.map((c) => ws.provenance[subject]?.[c.id]).filter((p): p is NonNullable<typeof p> => !!p))]

  const openNextDay = () => {
    const next = ws.mission.currentDay + 1
    update((w) => setMission(w, { currentDay: next }))
    setEndDay(next)
  }

  if (!isEnv && !ws.crew.some((c) => c.id === subject)) {
    return <EmptyState icon={Users} title="Add a crew member first" body="Measurements belong to a person. Add someone under Crew, or log the shared space conditions." action={<Button onClick={() => onSubject(ENV_SUBJECT)}>Log space conditions</Button>} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border border-border px-4 py-3">
        <span className="eyebrow-sm shrink-0">Logging for</span>
        <div className="flex flex-wrap gap-1.5">
          {ws.crew.map((c) => (
            <button key={c.id} onClick={() => onSubject(c.id)} aria-pressed={subject === c.id} className={`border px-2.5 py-1 text-[11px] transition-colors ${subject === c.id ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:border-border-strong hover:text-text'}`}>
              {c.name}
            </button>
          ))}
          <button onClick={() => onSubject(ENV_SUBJECT)} aria-pressed={isEnv} className={`border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${isEnv ? 'border-ember text-ember' : 'border-border text-muted hover:border-border-strong hover:text-text'}`}>
            Space conditions
          </button>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {provenances.map((p) => (
            <ProvenanceTag key={p} provenance={p} />
          ))}
        </span>
      </div>

      <Panel title={isEnv ? 'Space conditions by day' : 'Measurements by day'} note={`DAY ${days[days.length - 1]}–${days[0]} OF ${ws.mission.currentDay}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={openNextDay}>
            Open day {ws.mission.currentDay + 1}
          </Button>
          <Button size="sm" icon={<ChevronLeft className="h-3.5 w-3.5" />} disabled={endDay <= ROWS} onClick={() => setEndDay((d) => Math.max(ROWS, d - ROWS))}>
            Earlier
          </Button>
          <Button size="sm" disabled={endDay >= ws.mission.currentDay} onClick={() => setEndDay((d) => Math.min(ws.mission.currentDay, d + ROWS))}>
            Later <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <label className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-faint">
            Go to day
            <input className="mono h-7 w-20 border border-border-strong bg-transparent px-2 text-[12px] text-text-strong outline-none focus:border-accent" type="number" min={1} max={ws.mission.currentDay} value={endDay} onChange={(e) => setEndDay(Math.min(ws.mission.currentDay, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
        </div>

        {columns.length === 0 ? (
          <p className="text-xs text-muted">No indicators are switched on. Choose some below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="sticky left-0 z-10 bg-surface py-2 pr-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
                    Day
                  </th>
                  {columns.map((c) => (
                    <th key={c.id} scope="col" className="px-1 py-2 text-right align-bottom" title={`${c.label}. ${c.collection} Plausible range ${c.plausibleRange[0]}–${c.plausibleRange[1]} ${c.unit}.`}>
                      <span className="block text-[10px] font-medium leading-tight text-text">{c.shortLabel}</span>
                      <span className="annotate block">{c.unit}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day} className="border-b border-border/50">
                    <th scope="row" className={`mono sticky left-0 z-10 bg-surface py-1 pr-3 text-left text-[12px] font-normal ${day === ws.mission.currentDay ? 'text-accent' : 'text-muted'}`}>
                      {day}
                    </th>
                    {columns.map((c) => {
                      const v = series[c.id]?.[day] ?? null
                      const bad = v !== null && (v < c.plausibleRange[0] || v > c.plausibleRange[1])
                      return (
                        <td key={c.id} className="px-1 py-1">
                          <NumberCell
                            value={v}
                            decimals={c.decimals}
                            invalid={bad}
                            title={bad ? `Outside the plausible range (${c.plausibleRange[0]}–${c.plausibleRange[1]} ${c.unit}). Kept, but excluded from analysis.` : undefined}
                            ariaLabel={`${c.label}, day ${day}`}
                            onCommit={(value) => update((w) => setReading(w, subject, c.id, day, value))}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[10.5px] leading-snug text-muted">
          Type a number and press Enter or leave the cell to save it. Clear a cell to delete the reading. Leave days blank when nothing was measured; blanks are never treated as zero. Values outside an indicator's plausible range are kept but excluded from analysis.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title={isEnv ? 'Conditions tracked' : 'Indicators tracked'} note={`${columns.length} OF ${all.length} ON`} className="lg:col-span-7">
          <div className="space-y-3">
            {WORKSPACE_CATEGORIES.filter((cat) => all.some((i) => i.category === cat.id)).map((cat) => (
              <div key={cat.id}>
                <p className="eyebrow-sm mb-1.5">{cat.label}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {all
                    .filter((i) => i.category === cat.id)
                    .map((i) => (
                      <span key={i.id} className="inline-flex items-center gap-1.5">
                        <Checkbox
                          checked={i.enabled}
                          onChange={(v) => update((w) => setIndicatorEnabled(w, i.id, v))}
                          label={
                            <span className="text-xs">
                              {i.label} <span className="text-faint">({i.unit}{i.cadenceDays > 1 ? `, every ${i.cadenceDays} d` : ''})</span>
                            </span>
                          }
                        />
                        {!i.builtin && (
                          <button
                            className="p-0.5 text-muted hover:text-danger"
                            aria-label={`Delete ${i.label}`}
                            onClick={() => {
                              if (window.confirm(`Delete "${i.label}" and every reading logged for it?`)) update((w) => removeIndicator(w, i.id))
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-snug text-muted">Switching an indicator off hides its column. It does not delete what was logged.</p>
        </Panel>

        <Panel title={isEnv ? 'Add your own condition' : 'Add your own indicator'} className="lg:col-span-5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2">
              <input className={INPUT} value={custom.label} placeholder={isEnv ? 'Ammonia' : 'Grip strength'} onChange={(e) => setCustom({ ...custom, label: e.target.value })} />
            </Field>
            <Field label="Unit">
              <input className={INPUT} value={custom.unit} placeholder={isEnv ? 'ppm' : 'kg'} onChange={(e) => setCustom({ ...custom, unit: e.target.value })} />
            </Field>
            <Field label="Decimals">
              <input className={`${INPUT} mono`} type="number" min={0} max={3} value={custom.decimals} onChange={(e) => setCustom({ ...custom, decimals: Number(e.target.value) })} />
            </Field>
            <Field label="Lowest plausible">
              <input className={`${INPUT} mono`} type="number" value={custom.min} onChange={(e) => setCustom({ ...custom, min: e.target.value })} />
            </Field>
            <Field label="Highest plausible">
              <input className={`${INPUT} mono`} type="number" value={custom.max} onChange={(e) => setCustom({ ...custom, max: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Checkbox checked={custom.weekly} onChange={(v) => setCustom({ ...custom, weekly: v })} label={<span className="text-xs">Measured about weekly</span>} />
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={!custom.label.trim()}
              onClick={() => {
                update((w) => addIndicator(w, { label: custom.label, unit: custom.unit, scope, decimals: custom.decimals, cadenceDays: custom.weekly ? 7 : 1, min: custom.min === '' ? undefined : Number(custom.min), max: custom.max === '' ? undefined : Number(custom.max) }))
                setCustom({ label: '', unit: '', min: '', max: '', decimals: 1, weekly: false })
              }}
            >
              Add
            </Button>
          </div>
          <p className="mt-3 text-[10.5px] leading-snug text-muted">The plausible range only catches typing errors and sensor glitches. It is not a healthy range, and AURORA never applies one.</p>
        </Panel>
      </div>
    </div>
  )
}
