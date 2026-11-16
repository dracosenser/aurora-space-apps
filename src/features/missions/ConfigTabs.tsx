import { useState } from 'react'
import { Copy, Plus, Trash2, UserPlus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Checkbox } from '../../components/ui/Controls'
import { LIMITS } from '../../sim/engine'
import { EVENT_TYPES, EVENT_TYPE_BY_ID } from '../../sim/events'
import { duplicateAstronaut, newAstronaut, newEvent } from '../../sim/library'
import { ENV_BY_KEY, ENV_PARAMS, NOMINAL_ENVIRONMENT, outOfRange } from '../../sim/reference'
import type { AstronautProfile, EnvKey, EventType, MissionConfig, MissionEvent } from '../../sim/types'
import { Field, INPUT, Panel } from '../workbench/shared'

export type Edit = (fn: (m: MissionConfig) => MissionConfig) => void

/** Number input that tolerates partial typing and only commits finite numbers. */
export function Num({ value, onChange, min, max, step = 1, className = '', ariaLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; ariaLabel?: string }) {
  return (
    <input
      type="number"
      className={`${INPUT} mono ${className}`}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.valueAsNumber
        if (Number.isFinite(v)) onChange(v)
      }}
    />
  )
}

const DURATION_PRESETS = [30, 90, 150, 365]

// ------------------------------------------------------------------ mission

export function MissionTab({ m, edit }: { m: MissionConfig; edit: Edit }) {
  const set = (patch: Partial<MissionConfig>) => edit((x) => ({ ...x, ...patch }))
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Mission" className="lg:col-span-7">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mission name"><input className={INPUT} value={m.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Mission identifier"><input className={`${INPUT} mono`} value={m.missionCode} onChange={(e) => set({ missionCode: e.target.value })} /></Field>
          <Field label="Destination"><input className={INPUT} value={m.destination} onChange={(e) => set({ destination: e.target.value })} /></Field>
          <Field label="Start date"><input className={`${INPUT} mono`} type="date" value={m.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea className={`${INPUT} h-20 py-2`} value={m.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
      </Panel>
      <Panel title="Duration and simulation settings" className="lg:col-span-5">
        <div className="space-y-3">
          <Field label="Mission duration (days)" hint={`Daily resolution up to ${LIMITS.maxDaysDaily} days; hourly up to ${LIMITS.maxDaysHourly}.`}>
            <Num value={m.durationDays} min={1} max={LIMITS.maxDaysDaily} onChange={(v) => set({ durationDays: Math.round(v) })} />
          </Field>
          <div className="flex flex-wrap gap-1">
            {DURATION_PRESETS.map((d) => (
              <button key={d} onClick={() => set({ durationDays: d })} className={`border px-2 py-1 text-[10px] uppercase tracking-wider ${m.durationDays === d ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:text-text'}`}>
                {d} days
              </button>
            ))}
          </div>
          <Field label="Time resolution" hint="Hourly adds a 24-point daily profile (heart rate, breathing, SpO₂, temperature, activity). Detection always runs on daily values.">
            <select className={INPUT} value={m.resolution} onChange={(e) => set({ resolution: e.target.value as MissionConfig['resolution'] })}>
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </Field>
          <Field label="Random seed" hint="Same seed and inputs give exactly the same results. Keep it when comparing scenarios.">
            <div className="flex gap-2">
              <Num value={m.seed} min={0} onChange={(v) => set({ seed: Math.round(v) })} />
              <Button size="sm" onClick={() => set({ seed: Math.floor(Math.random() * 1e6) })}>New</Button>
            </div>
          </Field>
        </div>
      </Panel>
      <Panel title="Spacecraft" className="lg:col-span-12">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Vehicle name"><input className={INPUT} value={m.spacecraft.name} onChange={(e) => set({ spacecraft: { ...m.spacecraft, name: e.target.value } })} /></Field>
          <Field label="Habitable volume (m³)" hint="Recorded with the mission; not used by the model."><Num value={m.spacecraft.habitableVolumeM3} min={1} onChange={(v) => set({ spacecraft: { ...m.spacecraft, habitableVolumeM3: v } })} /></Field>
          <Field label="Exercise equipment" hint="Availability is set per astronaut and by events."><input className={INPUT} value={m.spacecraft.exerciseEquipment} onChange={(e) => set({ spacecraft: { ...m.spacecraft, exerciseEquipment: e.target.value } })} /></Field>
        </div>
      </Panel>
    </div>
  )
}

// --------------------------------------------------------------------- crew

export function CrewTab({ m, edit }: { m: MissionConfig; edit: Edit }) {
  const [openId, setOpenId] = useState<string | null>(m.crew[0]?.id ?? null)
  const updateA = (id: string, fn: (a: AstronautProfile) => AstronautProfile) => edit((x) => ({ ...x, crew: x.crew.map((a) => (a.id === id ? fn(a) : a)) }))
  const flying = m.crew.filter((c) => c.participates).length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={<UserPlus className="h-3.5 w-3.5" />}
          disabled={flying >= LIMITS.maxCrew}
          onClick={() => {
            const a = newAstronaut(m.crew.length)
            edit((x) => ({ ...x, crew: [...x.crew, a] }))
            setOpenId(a.id)
          }}
        >
          Add astronaut
        </Button>
        <span className="annotate">
          {m.crew.length} ON ROSTER · {flying} FLYING · UP TO {LIMITS.maxCrew} PER SIMULATION
        </span>
      </div>
      {m.crew.map((a) => {
        const open = openId === a.id
        return (
          <section key={a.id} className="panel">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.color }} />
              <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(open ? null : a.id)}>
                <span className="text-sm text-text-strong">{a.name || 'Unnamed'}</span>
                <span className="ml-2 text-xs text-muted">
                  {a.role}
                  {a.callsign ? ` · "${a.callsign}"` : ''}
                </span>
                <span className="annotate ml-2">{a.id}</span>
              </button>
              <Checkbox checked={a.participates} onChange={(v) => updateA(a.id, (x) => ({ ...x, participates: v }))} label={<span className="text-xs">Takes part</span>} />
              <button className="p-1.5 text-muted hover:text-text-strong" title="Duplicate" aria-label={`Duplicate ${a.name}`} onClick={() => edit((x) => ({ ...x, crew: [...x.crew, duplicateAstronaut(a, x.crew.length)] }))}>
                <Copy className="h-4 w-4" />
              </button>
              <button
                className="p-1.5 text-muted hover:text-danger"
                aria-label={`Remove ${a.name}`}
                onClick={() => {
                  const used = m.events.filter((e) => !e.crewWide && e.astronautIds.includes(a.id)).length
                  if (window.confirm(`Remove ${a.name}?${used ? ` They are named in ${used} event(s), which will no longer apply to them.` : ''}`))
                    edit((x) => ({ ...x, crew: x.crew.filter((c) => c.id !== a.id), events: x.events.map((e) => ({ ...e, astronautIds: e.astronautIds.filter((id) => id !== a.id) })) }))
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {open && <AstronautEditor a={a} update={(fn) => updateA(a.id, fn)} />}
          </section>
        )
      })}
    </div>
  )
}

function AstronautEditor({ a, update }: { a: AstronautProfile; update: (fn: (a: AstronautProfile) => AstronautProfile) => void }) {
  const s = (patch: Partial<AstronautProfile['schedule']>) => update((x) => ({ ...x, schedule: { ...x.schedule, ...patch } }))
  const b = (patch: Partial<AstronautProfile['baseline']>) => update((x) => ({ ...x, baseline: { ...x.baseline, ...patch } }))
  return (
    <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-3">
      <div className="space-y-3">
        <p className="eyebrow-sm">Identity</p>
        <Field label="Full name"><input className={INPUT} value={a.name} onChange={(e) => update((x) => ({ ...x, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Call sign"><input className={INPUT} value={a.callsign} onChange={(e) => update((x) => ({ ...x, callsign: e.target.value }))} /></Field>
          <Field label="Role"><input className={INPUT} value={a.role} onChange={(e) => update((x) => ({ ...x, role: e.target.value }))} /></Field>
        </div>
        <Field label="Responsibilities"><input className={INPUT} value={a.responsibilities} onChange={(e) => update((x) => ({ ...x, responsibilities: e.target.value }))} /></Field>
        <Field label="Profile notes"><textarea className={`${INPUT} h-16 py-2`} value={a.description} onChange={(e) => update((x) => ({ ...x, description: e.target.value }))} /></Field>
      </div>
      <div className="space-y-3">
        <p className="eyebrow-sm">Mission profile</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sleep starts (hour)"><Num value={a.schedule.sleepStartHour} min={0} max={23} onChange={(v) => s({ sleepStartHour: v })} /></Field>
          <Field label="Sleep period (h)"><Num value={a.schedule.sleepHours} min={2} max={14} step={0.25} onChange={(v) => s({ sleepHours: v })} /></Field>
          <Field label="Work hours/day"><Num value={a.schedule.workHours} min={0} max={18} step={0.5} onChange={(v) => s({ workHours: v })} /></Field>
          <Field label="Workload (1–5)"><Num value={a.schedule.workload} min={1} max={5} step={0.5} onChange={(v) => s({ workload: v })} /></Field>
          <Field label="Exercise sessions/week"><Num value={a.schedule.exerciseSessionsPerWeek} min={0} max={14} onChange={(v) => s({ exerciseSessionsPerWeek: v })} /></Field>
          <Field label="Minutes per session"><Num value={a.schedule.exerciseMinutes} min={0} max={180} step={5} onChange={(v) => s({ exerciseMinutes: v })} /></Field>
          <Field label="Exercise hour" className="col-span-2"><Num value={a.schedule.exerciseHour} min={0} max={23} onChange={(v) => s({ exerciseHour: v })} /></Field>
        </div>
        <p className="text-[10.5px] leading-snug text-muted">EVAs are scheduled as events so they can be dated and assigned.</p>
      </div>
      <div className="space-y-3">
        <p className="eyebrow-sm">Health baseline</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Resting HR (bpm)"><Num value={a.baseline.restingHR} min={30} max={120} onChange={(v) => b({ restingHR: v })} /></Field>
          <Field label="HRV (ms)"><Num value={a.baseline.hrv} min={5} max={200} onChange={(v) => b({ hrv: v })} /></Field>
          <Field label="Resp. rate (/min)"><Num value={a.baseline.respRate} min={6} max={30} step={0.5} onChange={(v) => b({ respRate: v })} /></Field>
          <Field label="SpO₂ (%)"><Num value={a.baseline.spo2} min={80} max={100} step={0.5} onChange={(v) => b({ spo2: v })} /></Field>
          <Field label="Body temp (°C)"><Num value={a.baseline.bodyTemp} min={34} max={39} step={0.1} onChange={(v) => b({ bodyTemp: v })} /></Field>
          <Field label="Typical sleep (h)"><Num value={a.baseline.sleepNeed} min={3} max={12} step={0.1} onChange={(v) => b({ sleepNeed: v })} /></Field>
          <Field label="Activity (min/day)" hint="Including scheduled exercise"><Num value={a.baseline.activityMinutes} min={0} max={900} step={5} onChange={(v) => b({ activityMinutes: v })} /></Field>
          <Field label="Variation (×)" hint="1 = typical"><Num value={a.baseline.variability} min={0.2} max={3} step={0.1} onChange={(v) => b({ variability: v })} /></Field>
          <Field label="Systolic BP (mmHg)"><Num value={a.baseline.systolicBP ?? 118} min={80} max={180} onChange={(v) => b({ systolicBP: v })} /></Field>
          <Field label="Diastolic BP (mmHg)"><Num value={a.baseline.diastolicBP ?? 76} min={40} max={120} onChange={(v) => b({ diastolicBP: v })} /></Field>
        </div>
        <p className="text-[10.5px] leading-snug text-muted">Baselines are starting values for the simulation, not medical assessments. Defaults are typical healthy-adult examples.</p>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- environment

export function EnvironmentTab({ m, edit }: { m: MissionConfig; edit: Edit }) {
  const set = (key: EnvKey, v: number) => edit((x) => ({ ...x, environment: { ...x.environment, [key]: v } }))
  const GRAVITY = [
    { label: 'Microgravity', g: 0 },
    { label: 'Moon', g: 0.165 },
    { label: 'Mars', g: 0.38 },
    { label: 'Earth', g: 1 },
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => edit((x) => ({ ...x, environment: { ...NOMINAL_ENVIRONMENT, gravityG: x.environment.gravityG, radiationMSvPerDay: x.environment.radiationMSvPerDay } }))}>
          Reset atmosphere to sea-level nominal
        </Button>
        <p className="text-xs text-muted">These are the cabin conditions for the whole mission. Change them for part of the mission with an Environmental anomaly event.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ENV_PARAMS.map((p) => {
          const v = m.environment[p.key]
          const oor = outOfRange(p.key, v)
          const usedBy = MODEL_USE[p.key]
          return (
            <section key={p.key} className={`panel p-3.5 ${oor ? 'border-warn/60' : ''}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[13px] text-text-strong">{p.label}</h4>
                {oor ? <Badge tone="warn">{oor === 'high' ? 'Above' : 'Below'} reference</Badge> : p.reference ? <Badge tone="ok">In reference</Badge> : <Badge>No reference</Badge>}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">{p.description}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => set(p.key, Number(e.target.value))} style={{ ['--fill' as string]: `${((v - p.min) / (p.max - p.min)) * 100}%` }} aria-label={p.label} />
                <div className="w-28 shrink-0">
                  <Num value={v} min={p.min} max={p.max} step={p.step} onChange={(x) => set(p.key, x)} ariaLabel={`${p.label} value`} />
                </div>
                <span className="w-16 shrink-0 text-[11px] text-muted">{p.unit}</span>
              </div>
              {p.key === 'gravityG' && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {GRAVITY.map((g) => (
                    <button key={g.label} onClick={() => set('gravityG', g.g)} className={`border px-2 py-0.5 text-[10px] uppercase tracking-wider ${v === g.g ? 'border-text-strong text-text-strong' : 'border-border text-muted'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              )}
              {p.reference && (
                <p className="mt-2 text-[10.5px] leading-snug text-muted">
                  <span className="text-text">
                    Reference {p.reference.low ?? '—'}–{p.reference.high ?? '—'} {p.unit}
                  </span>{' '}
                  <span className="uppercase tracking-wider text-faint">[{p.reference.kind === 'standard' ? 'standard' : p.reference.kind === 'literature' ? 'literature' : 'demo setting'}]</span> {p.reference.source}
                </p>
              )}
              <p className="mt-1.5 text-[10.5px] leading-snug text-muted">
                <span className="text-text">In the model:</span> {usedBy}
              </p>
            </section>
          )
        })}
      </div>
      <p className="text-[10.5px] leading-snug text-muted">All values here are scenario settings for a simulation, not measurements from a spacecraft.</p>
    </div>
  )
}

const MODEL_USE: Record<EnvKey, string> = {
  cabinTempC: 'outside 18–27 °C reduces sleep efficiency and nudges body temperature (simplified assumptions).',
  pressureKPa: 'with oxygen partial pressure, sets oxygen saturation (alveolar gas equation).',
  ppO2KPa: 'sets oxygen saturation; lower saturation raises heart rate (simplified).',
  co2mmHg: 'above 3 mmHg reduces sleep quality and raises breathing rate (simplified).',
  humidityPct: 'recorded and checked against its reference; no physiological effect is modeled.',
  radiationMSvPerDay: 'accumulates as daily dose (accounting, no health effect modeled).',
  gravityG: 'scales cardiovascular deconditioning when exercise is reduced (simplified).',
  lightingLux: 'recorded; schedule shifts are modeled through Lighting schedule change events.',
  noiseDBA: 'above 50 dBA reduces sleep efficiency (simplified).',
  vibrationMS2: 'recorded and displayed; no physiological effect is modeled.',
  particulatesUgM3: 'recorded and displayed; no physiological effect is modeled.',
}

// ------------------------------------------------------------------- events

export function EventsTab({ m, edit }: { m: MissionConfig; edit: Edit }) {
  const [type, setType] = useState<EventType>('workload')
  const [openId, setOpenId] = useState<string | null>(null)
  const updateE = (id: string, fn: (e: MissionEvent) => MissionEvent) => edit((x) => ({ ...x, events: x.events.map((e) => (e.id === id ? fn(e) : e)) }))
  const sorted = [...m.events].sort((a, b) => a.startDay - b.startDay)
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Schedule an event" className="lg:col-span-4">
        <Field label="Event type">
          <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {EVENT_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="mt-2 text-xs leading-relaxed text-muted">{EVENT_TYPE_BY_ID[type].description}</p>
        <p className="mt-2 text-[10.5px] leading-snug text-muted">Acts through: {EVENT_TYPE_BY_ID[type].actsThrough.join(', ')}. Events change model inputs only; health changes follow from documented effects.</p>
        <Button
          className="mt-3"
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            const def = EVENT_TYPE_BY_ID[type]
            const e = newEvent(type, Math.min(m.durationDays, Math.max(1, Math.round(m.durationDays / 3))), def.defaultDuration, def.label)
            if (def.env.length) e.envOverride = { [def.env[0]]: m.environment[def.env[0]] }
            edit((x) => ({ ...x, events: [...x.events, e] }))
            setOpenId(e.id)
          }}
        >
          Add to mission
        </Button>
      </Panel>
      <div className="space-y-2 lg:col-span-8">
        {/* Timeline strip */}
        <div className="panel p-3">
          <p className="eyebrow-sm mb-2">Mission timeline · {m.durationDays} days</p>
          <div className="relative" style={{ height: Math.max(24, sorted.length * 10 + 8) }}>
            {sorted.map((e, i) => (
              <button key={e.id} title={`${e.title}: day ${e.startDay}, ${e.durationDays} d`} onClick={() => setOpenId(e.id)} className="absolute h-2 bg-ember/70 hover:bg-ember" style={{ top: 4 + i * 10, left: `${((e.startDay - 1) / m.durationDays) * 100}%`, width: `${Math.max(0.6, (Math.min(e.durationDays, m.durationDays - e.startDay + 1) / m.durationDays) * 100)}%` }} />
            ))}
          </div>
        </div>
        {sorted.length === 0 && <p className="text-xs text-muted">No events yet. A mission with no events still runs: it shows each astronaut's baseline with ordinary variation and the effects of the cabin conditions.</p>}
        {sorted.map((e) => {
          const def = EVENT_TYPE_BY_ID[e.type]
          const open = openId === e.id
          return (
            <section key={e.id} className="panel">
              <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(open ? null : e.id)}>
                  <span className="text-sm text-text-strong">{e.title}</span>
                  <span className="annotate ml-2">
                    {def.label.toUpperCase()} · DAY {e.startDay}
                    {e.durationDays > 1 ? `–${e.startDay + e.durationDays - 1}` : ''} · {e.crewWide ? 'WHOLE CREW' : `${e.astronautIds.length} ASTRONAUT${e.astronautIds.length === 1 ? '' : 'S'}`}
                  </span>
                </button>
                <button className="p-1.5 text-muted hover:text-danger" aria-label={`Remove ${e.title}`} onClick={() => edit((x) => ({ ...x, events: x.events.filter((y) => y.id !== e.id) }))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {open && (
                <div className="grid gap-3 border-t border-border p-3.5 sm:grid-cols-2">
                  <Field label="Title"><input className={INPUT} value={e.title} onChange={(ev) => updateE(e.id, (x) => ({ ...x, title: ev.target.value }))} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Start day"><Num value={e.startDay} min={1} max={m.durationDays} onChange={(v) => updateE(e.id, (x) => ({ ...x, startDay: Math.max(1, Math.round(v)) }))} /></Field>
                    <Field label="Duration (days)"><Num value={e.durationDays} min={1} onChange={(v) => updateE(e.id, (x) => ({ ...x, durationDays: Math.max(1, Math.round(v)) }))} /></Field>
                  </div>
                  {def.params.map((p) => (
                    <Field key={p.key} label={`${p.label} (${p.unit})`}>
                      <Num value={e.params[p.key] ?? p.default} min={p.min} max={p.max} step={p.step} onChange={(v) => updateE(e.id, (x) => ({ ...x, params: { ...x.params, [p.key]: v } }))} />
                    </Field>
                  ))}
                  {def.env.map((k) => {
                    const on = e.envOverride?.[k] !== undefined
                    const pd = ENV_BY_KEY[k]
                    return (
                      <div key={k} className="flex items-end gap-2">
                        <Checkbox
                          checked={on}
                          onChange={(v) =>
                            updateE(e.id, (x) => {
                              const o = { ...(x.envOverride ?? {}) }
                              if (v) o[k] = m.environment[k]
                              else delete o[k]
                              return { ...x, envOverride: o }
                            })
                          }
                          label={<span className="text-xs">{pd.label}</span>}
                        />
                        {on && (
                          <div className="w-28">
                            <Num value={e.envOverride![k]!} min={pd.min} max={pd.max} step={pd.step} onChange={(v) => updateE(e.id, (x) => ({ ...x, envOverride: { ...x.envOverride, [k]: v } }))} ariaLabel={`${pd.label} during event`} />
                          </div>
                        )}
                        {on && <span className="pb-2 text-[11px] text-muted">{pd.unit}</span>}
                      </div>
                    )
                  })}
                  <div className="sm:col-span-2">
                    <p className="eyebrow-sm mb-1.5">Who it affects</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <Checkbox checked={e.crewWide} onChange={(v) => updateE(e.id, (x) => ({ ...x, crewWide: v }))} label={<span className="text-xs">Entire crew</span>} />
                      {!e.crewWide &&
                        m.crew.map((a) => (
                          <Checkbox
                            key={a.id}
                            checked={e.astronautIds.includes(a.id)}
                            color={a.color}
                            onChange={(v) => updateE(e.id, (x) => ({ ...x, astronautIds: v ? [...x.astronautIds, a.id] : x.astronautIds.filter((id) => id !== a.id) }))}
                            label={<span className="text-xs">{a.name}</span>}
                          />
                        ))}
                    </div>
                    {def.env.length > 0 && !e.crewWide && <p className="mt-1.5 text-[10.5px] text-muted">Cabin conditions are shared, so environmental changes apply to the selected astronauts' simulation but are not shown on the shared cabin chart.</p>}
                  </div>
                  <Field label="Notes" className="sm:col-span-2"><input className={INPUT} value={e.notes} onChange={(ev) => updateE(e.id, (x) => ({ ...x, notes: ev.target.value }))} /></Field>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
