import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { MissionEventRecord } from '../../engine/types'
import { Button } from '../../components/ui/Button'
import { addEvent, addPhase, removeEvent, removePhase, setMission } from '../../workspace/ops'
import { radiationSummary, summariseSeries } from '../../workspace/dataset'
import { ENV_SUBJECT, type Workspace } from '../../workspace/types'
import { Field, INPUT, Panel, fmt, type Update } from './shared'

const GRAVITY_PRESETS: { label: string; g: number }[] = [
  { label: 'Microgravity', g: 0 },
  { label: 'Moon', g: 0.165 },
  { label: 'Mars', g: 0.38 },
  { label: 'Earth', g: 1 },
]

const EVENT_KINDS: MissionEventRecord['kind'][] = ['operations', 'environment', 'systems', 'schedule', 'medical', 'other']

/** Cumulative radiation dose from the logged daily readings, against the career limit. */
export function RadiationCard({ ws }: { ws: Workspace }) {
  const r = radiationSummary(ws)
  const pct = Math.min(100, r.fractionOfLimit * 100)
  const projectedPct = r.projected !== null ? Math.min(100, (r.projected / r.limit) * 100) : 0
  return (
    <Panel title="Cumulative radiation dose" note={`${r.loggedDays} DAY${r.loggedDays === 1 ? '' : 'S'} LOGGED`}>
      {r.loggedDays === 0 ? (
        <p className="text-xs leading-relaxed text-muted">Log a daily radiation dose under Space conditions and AURORA will total it against the {r.limit} mSv career limit in NASA-STD-3001.</p>
      ) : (
        <>
          <p className="mono text-2xl text-text-strong">
            {fmt(r.cumulative, 1)} <span className="text-sm text-muted">mSv of {r.limit}</span>
          </p>
          <div className="relative mt-3 h-1.5 bg-surface-3">
            {r.projected !== null && <div className="absolute inset-y-0 left-0 bg-border-strong" style={{ width: `${projectedPct}%` }} />}
            <div className={`absolute inset-y-0 left-0 ${pct >= 100 ? 'bg-danger' : 'bg-ember'}`} style={{ width: `${pct}%` }} />
          </div>
          <dl className="mono mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
            <dt className="text-muted">Share of limit</dt>
            <dd className="text-text">{fmt(r.fractionOfLimit * 100, 1)}%</dd>
            <dt className="text-muted">Mean logged rate</dt>
            <dd className="text-text">{fmt(r.meanRate, 2)} mSv/day</dd>
            <dt className="text-muted">Highest day</dt>
            <dd className="text-text">
              {fmt(r.peakDose, 2)} mSv, day {r.peakDay}
            </dd>
            <dt className="text-muted">If the rate held</dt>
            <dd className={r.projected !== null && r.projected > r.limit ? 'text-ember' : 'text-text'}>
              {fmt(r.projected, 0)} mSv by day {ws.mission.totalDays}
            </dd>
          </dl>
          <p className="mt-2 text-[10.5px] leading-snug text-muted">
            The total counts logged days only. The projection assumes the mean logged rate on every day of the planned mission and is an extrapolation, not a forecast.
          </p>
        </>
      )}
    </Panel>
  )
}

export function MissionSetup({ ws, update }: { ws: Workspace; update: Update }) {
  const [phase, setPhase] = useState({ name: '', startDay: 1, endDay: ws.mission.totalDays, gravity: 0 })
  const [event, setEvent] = useState<{ title: string; day: number; endDay: string; kind: MissionEventRecord['kind']; description: string }>({ title: '', day: ws.mission.currentDay, endDay: '', kind: 'operations', description: '' })
  const conditions = ws.indicators.filter((i) => i.scope === 'environment' && i.enabled)

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Mission" className="lg:col-span-7">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mission name">
            <input className={INPUT} value={ws.mission.name} onChange={(e) => update((w) => setMission(w, { name: e.target.value }))} />
          </Field>
          <Field label="Destination">
            <input className={INPUT} value={ws.mission.destination} placeholder="Lunar orbit, Mars surface…" onChange={(e) => update((w) => setMission(w, { destination: e.target.value }))} />
          </Field>
          <Field label="Planned length (days)" hint="Used for projections. Logging past it extends it.">
            <input className={`${INPUT} mono`} type="number" min={1} max={2000} value={ws.mission.totalDays} onChange={(e) => update((w) => setMission(w, { totalDays: Number(e.target.value) || 1 }))} />
          </Field>
          <Field label="Current mission day" hint="The latest day you have data for.">
            <input className={`${INPUT} mono`} type="number" min={1} max={2000} value={ws.mission.currentDay} onChange={(e) => update((w) => setMission(w, { currentDay: Number(e.target.value) || 1 }))} />
          </Field>
        </div>
      </Panel>

      <div className="lg:col-span-5">
        <RadiationCard ws={ws} />
      </div>

      <Panel title="Mission phases and gravity" note={`${ws.phases.length} DEFINED`} className="lg:col-span-6">
        <p className="mb-3 text-xs leading-relaxed text-muted">Phases describe the conditions the crew is in. They appear as context on timelines and beside any before/after comparison.</p>
        {ws.phases.length > 0 && (
          <ul className="mb-3 divide-y divide-border border-y border-border">
            {ws.phases.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-text-strong">{p.name}</span>
                <span className="mono text-muted">
                  days {p.startDay}–{p.endDay}
                </span>
                <span className="mono w-14 text-right text-text">{p.gravity} g</span>
                <button className="p-1 text-muted hover:text-danger" aria-label={`Remove phase ${p.name}`} onClick={() => update((w) => removePhase(w, p.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Phase" className="col-span-2">
            <input className={INPUT} value={phase.name} placeholder="Outbound transit" onChange={(e) => setPhase({ ...phase, name: e.target.value })} />
          </Field>
          <Field label="From day">
            <input className={`${INPUT} mono`} type="number" min={1} value={phase.startDay} onChange={(e) => setPhase({ ...phase, startDay: Number(e.target.value) })} />
          </Field>
          <Field label="To day">
            <input className={`${INPUT} mono`} type="number" min={1} value={phase.endDay} onChange={(e) => setPhase({ ...phase, endDay: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Gravity (g)" className="w-24">
            <input className={`${INPUT} mono`} type="number" min={0} max={3} step={0.01} value={phase.gravity} onChange={(e) => setPhase({ ...phase, gravity: Number(e.target.value) })} />
          </Field>
          <div className="flex flex-wrap gap-1 pb-0.5">
            {GRAVITY_PRESETS.map((g) => (
              <button key={g.label} onClick={() => setPhase({ ...phase, gravity: g.g })} className={`border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${phase.gravity === g.g ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:text-text'}`}>
                {g.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            className="ml-auto"
            icon={<Plus className="h-3.5 w-3.5" />}
            disabled={!phase.name.trim()}
            onClick={() => {
              update((w) => addPhase(w, phase))
              setPhase({ ...phase, name: '', startDay: phase.endDay + 1 })
            }}
          >
            Add phase
          </Button>
        </div>
      </Panel>

      <Panel title="Mission events" note={`${ws.events.length} LOGGED`} className="lg:col-span-6">
        <p className="mb-3 text-xs leading-relaxed text-muted">Spacewalks, schedule shifts, equipment faults, solar events. The engine lists them as context so a change in the numbers can be read against what was happening.</p>
        {ws.events.length > 0 && (
          <ul className="mb-3 max-h-44 divide-y divide-border overflow-y-auto border-y border-border">
            {ws.events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="mono w-20 shrink-0 text-muted">
                  day {e.day}
                  {e.endDay ? `–${e.endDay}` : ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-text-strong" title={e.description}>
                  {e.title}
                </span>
                <span className="annotate hidden sm:inline">{e.kind.toUpperCase()}</span>
                <button className="p-1 text-muted hover:text-danger" aria-label={`Remove event ${e.title}`} onClick={() => update((w) => removeEvent(w, e.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Event" className="col-span-2">
            <input className={INPUT} value={event.title} placeholder="EVA-3" onChange={(e) => setEvent({ ...event, title: e.target.value })} />
          </Field>
          <Field label="Day">
            <input className={`${INPUT} mono`} type="number" min={1} value={event.day} onChange={(e) => setEvent({ ...event, day: Number(e.target.value) })} />
          </Field>
          <Field label="Until (optional)">
            <input className={`${INPUT} mono`} type="number" min={1} value={event.endDay} onChange={(e) => setEvent({ ...event, endDay: e.target.value })} />
          </Field>
          <Field label="Kind">
            <select className={INPUT} value={event.kind} onChange={(e) => setEvent({ ...event, kind: e.target.value as MissionEventRecord['kind'] })}>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note" className="col-span-2 sm:col-span-3">
            <input className={INPUT} value={event.description} placeholder="Optional detail" onChange={(e) => setEvent({ ...event, description: e.target.value })} />
          </Field>
        </div>
        <Button
          size="sm"
          className="mt-3"
          icon={<Plus className="h-3.5 w-3.5" />}
          disabled={!event.title.trim()}
          onClick={() => {
            update((w) => addEvent(w, { title: event.title, day: event.day, endDay: event.endDay ? Number(event.endDay) : undefined, kind: event.kind, description: event.description }))
            setEvent({ ...event, title: '', description: '', endDay: '' })
          }}
        >
          Add event
        </Button>
      </Panel>

      <Panel title="Space conditions on record" note="SHARED BY THE CREW" className="lg:col-span-12">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[9px] uppercase tracking-[0.14em] text-faint">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">Condition</th>
                <th className="px-3 py-2 font-semibold">Latest</th>
                <th className="px-3 py-2 font-semibold">Mean</th>
                <th className="px-3 py-2 font-semibold">Days logged</th>
                <th className="py-2 pl-3 font-semibold">How it is measured</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((ind) => {
                const s = summariseSeries(ws, ENV_SUBJECT, ind)
                return (
                  <tr key={ind.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-text-strong">{ind.label}</td>
                    <td className="mono px-3 py-2 text-text">
                      {fmt(s.latest, ind.decimals)} <span className="text-faint">{ind.unit}</span>
                    </td>
                    <td className="mono px-3 py-2 text-muted">{fmt(s.mean, ind.decimals)}</td>
                    <td className="mono px-3 py-2 text-muted">
                      {s.count}
                      {s.lastDay ? ` · last day ${s.lastDay}` : ''}
                    </td>
                    <td className="py-2 pl-3 text-muted">{ind.collection}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10.5px] leading-snug text-muted">
          Enter these under Log data, choosing “Space conditions”. They are baselined like any other series and tested for association with each crew member's health signals, but they are never counted as part of a joint health pattern.
        </p>
      </Panel>
    </div>
  )
}
