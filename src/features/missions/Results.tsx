import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { Disclaimer } from '../../components/ui/Misc'
import { downloadText } from '../../lib/report'
import { ALERT_LABEL, summarise, type SimAlert } from '../../sim/analyze'
import { participants } from '../../sim/engine'
import { EVENT_TYPE_BY_ID } from '../../sim/events'
import { ENV_BY_KEY, ENV_PARAMS, SIM_INDICATORS, SIM_INDICATOR_BY_ID, outOfRange } from '../../sim/reference'
import { analysisFor, crewAlerts } from '../../sim/runtime'
import type { HourlyChannel, MissionConfig, SimIndicator, SimulationResult } from '../../sim/types'
import { Panel } from '../workbench/shared'
import { SimChart, type ChartBand } from './SimChart'

export function fmt(v: number | null | undefined, d = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('-', '−')
}

export function eventBands(m: MissionConfig, astronautId?: string): ChartBand[] {
  return m.events
    .filter((e) => !astronautId || e.crewWide || e.astronautIds.includes(astronautId))
    .map((e) => ({ start: e.startDay, end: Math.min(m.durationDays, e.startDay + e.durationDays - 1), label: `${e.title} (${EVENT_TYPE_BY_ID[e.type].label})` }))
}

export function resultsCsv(m: MissionConfig, r: SimulationResult): string {
  const lines = [`# AURORA simulation export. SIMULATED DATA, not measurements. Mission ${m.missionCode} "${m.name}", seed ${m.seed}, fingerprint ${r.fingerprint}`]
  lines.push(['day', 'astronaut_id', 'astronaut', ...SIM_INDICATORS.map((d) => d.id)].join(','))
  for (const run of r.astronauts) {
    const name = (m.crew.find((c) => c.id === run.astronautId)?.name ?? '').replace(/,/g, ' ')
    for (let i = 0; i < r.days; i++) lines.push([i + 1, run.astronautId, name, ...SIM_INDICATORS.map((d) => run.daily[d.id][i].toFixed(SIM_INDICATOR_BY_ID[d.id].decimals + 1))].join(','))
  }
  lines.push('', ['day', ...ENV_PARAMS.map((p) => `env_${p.key}`)].join(','))
  for (let i = 0; i < r.days; i++) lines.push([i + 1, ...ENV_PARAMS.map((p) => r.environment[p.key][i])].join(','))
  return lines.join('\n') + '\n'
}

export function AlertCardSim({ alert, name }: { alert: SimAlert; name?: string }) {
  const [open, setOpen] = useState(false)
  const tone = alert.level === 'pattern-requiring-investigation' ? 'ember' : alert.level === 'unusual-trend' ? 'warn' : 'neutral'
  return (
    <article className={`border ${alert.active ? 'border-border-strong' : 'border-border'} bg-surface`}>
      <button className="w-full px-3 py-2.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={tone}>{ALERT_LABEL[alert.level]}</Badge>
          {!alert.active && <Badge>ended</Badge>}
          {name && <span className="text-xs text-text-strong">{name}</span>}
          <span className="annotate">
            DAY {alert.startDay}
            {alert.endDay !== alert.startDay ? `–${alert.endDay}` : ''} · {alert.indicators.map((i) => SIM_INDICATOR_BY_ID[i as SimIndicator]?.shortLabel ?? i).join(', ')}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-text">{alert.explanation}</p>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-xs">
          <div>
            <p className="eyebrow-sm mb-1">Supporting data</p>
            <table className="w-full">
              <tbody>
                {alert.supporting.map((s) => (
                  <tr key={s.indicator} className="border-b border-border/60">
                    <td className="py-1 text-text">{s.label}</td>
                    <td className="mono py-1 text-muted">baseline {fmt(s.baseline, 1)}</td>
                    <td className="mono py-1 text-text-strong">recent {fmt(s.recent, 1)} {s.unit}</td>
                    <td className="mono py-1 text-right">{s.percentChange !== null ? `${s.percentChange > 0 ? '+' : ''}${fmt(s.percentChange, 0)}%` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="eyebrow-sm mb-1">Modeled effects acting on these indicators in this window</p>
            {alert.effects.length === 0 ? (
              <p className="text-muted">None above display precision: the change is within the astronaut's simulated ordinary variation.</p>
            ) : (
              <ul className="space-y-1.5">
                {alert.effects.slice(0, 6).map((e) => (
                  <li key={`${e.effectId}-${e.indicator}`}>
                    <span className="text-text-strong">{e.label}</span>{' '}
                    <span className="mono text-muted">
                      {e.meanDelta > 0 ? '+' : ''}
                      {fmt(e.meanDelta, SIM_INDICATOR_BY_ID[e.indicator].decimals + 1)} {SIM_INDICATOR_BY_ID[e.indicator].unit} on {SIM_INDICATOR_BY_ID[e.indicator].shortLabel.toLowerCase()} (mean)
                    </span>{' '}
                    <Badge tone={e.basis === 'established' ? 'ok' : 'neutral'}>{e.basis === 'established' ? 'established relationship' : 'simplified assumption'}</Badge>
                    <p className="mt-0.5 text-[10.5px] text-muted">{e.source}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {alert.events.length > 0 && (
            <p className="text-muted">
              <span className="text-text">Coinciding mission events:</span> {alert.events.map((e) => `${e.title} (day ${e.startDay}${e.durationDays > 1 ? `–${e.startDay + e.durationDays - 1}` : ''})`).join('; ')}
            </p>
          )}
          <p className="text-muted">
            <span className="text-text">Confidence:</span> {alert.evidence} Coinciding with an event does not show that the event caused the change.
          </p>
        </div>
      )}
    </article>
  )
}

const HOURLY: { key: HourlyChannel; label: string; unit: string }[] = [
  { key: 'heartRate', label: 'Heart rate', unit: 'bpm' },
  { key: 'respRate', label: 'Respiratory rate', unit: '/min' },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'bodyTemp', label: 'Body temperature', unit: '°C' },
  { key: 'activity', label: 'Activity level', unit: 'index' },
]

export function ResultsView({ m, r }: { m: MissionConfig; r: SimulationResult }) {
  const crew = participants(m).filter((c) => r.astronauts.some((a) => a.astronautId === c.id))
  const [view, setView] = useState<'crew' | 'individual' | 'environment'>('crew')
  const [indicator, setIndicator] = useState<SimIndicator>('restingHR')
  const [who, setWho] = useState(crew[0]?.id ?? '')
  const [day, setDay] = useState(r.days)
  const d = Math.min(day, r.days)
  const alerts = useMemo(() => crewAlerts(m, r, d), [m, r, d])
  const def = SIM_INDICATOR_BY_ID[indicator]
  const person = crew.find((c) => c.id === who) ?? crew[0]
  const run = r.astronauts.find((a) => a.astronautId === person?.id)
  const nameOf = (id: string) => m.crew.find((c) => c.id === id)?.name ?? id

  return (
    <div className="space-y-4">
      {/* Mission overview */}
      <div className="grid gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Duration', `${r.days} days`, m.resolution === 'hourly' ? 'hourly + daily' : 'daily'],
          ['Astronauts', String(r.astronauts.length), `${m.crew.length - r.astronauts.length} not flying`],
          ['Events', String(m.events.length), `${m.events.filter((e) => e.crewWide).length} crew-wide`],
          ['Alerts', String(alerts.filter((a) => a.active).length), `active on day ${d}; ${alerts.length} total`],
          ['Simulation', `${r.ms.toFixed(0)} ms`, `seed ${m.seed}`],
          ['Status', 'Complete', r.warnings.length ? `${r.warnings.length} warning(s)` : 'no warnings'],
        ].map(([k, v, n]) => (
          <div key={k} className="bg-surface p-3">
            <p className="eyebrow-sm">{k}</p>
            <p className="mono mt-1 text-lg text-text-strong">{v}</p>
            <p className="text-[10.5px] text-muted">{n}</p>
          </div>
        ))}
      </div>
      {r.warnings.map((w) => (
        <p key={w} className="border border-warn/40 px-3 py-1.5 text-xs text-warn">
          {w}
        </p>
      ))}

      {/* Mission timeline */}
      <Panel title="Mission timeline" note={`DAY ${d} OF ${r.days}`}>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={r.days} value={d} onChange={(e) => setDay(Number(e.target.value))} style={{ ['--fill' as string]: `${((d - 1) / Math.max(1, r.days - 1)) * 100}%` }} aria-label="Mission day" />
          <span className="mono w-16 text-right text-sm text-text-strong">day {d}</span>
        </div>
        <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
          {[...m.events].sort((a, b) => a.startDay - b.startDay).map((e) => {
            const active = d >= e.startDay && d < e.startDay + e.durationDays
            return (
              <li key={e.id}>
                <button onClick={() => setDay(Math.min(r.days, e.startDay))} className={`flex w-full items-center gap-2 border px-2 py-1 text-left ${active ? 'border-ember/60 text-text-strong' : 'border-border text-muted hover:text-text'}`}>
                  <span className="mono w-20 shrink-0">
                    d{e.startDay}
                    {e.durationDays > 1 ? `–${e.startDay + e.durationDays - 1}` : ''}
                  </span>
                  <span className="truncate">{e.title}</span>
                  <span className="ml-auto shrink-0 text-[10px]">{e.crewWide ? 'crew' : e.astronautIds.map(nameOf).join(', ')}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: 'crew', label: 'Crew overview' }, { value: 'individual', label: 'Individual astronaut' }, { value: 'environment', label: 'Cabin environment' }]} />
        <Button size="sm" className="ml-auto" icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(`${m.missionCode || 'mission'}-results.csv`, resultsCsv(m, r), 'text/csv')}>
          Export results CSV
        </Button>
        <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(`${m.missionCode || 'mission'}.mission.json`, JSON.stringify(m, null, 2), 'application/json')}>
          Export mission
        </Button>
      </div>

      {view === 'crew' && (
        <>
          <Panel title="Crew comparison" note="CLICK THE CHART TO MOVE THROUGH THE MISSION">
            <div className="mb-2 flex flex-wrap gap-1">
              {SIM_INDICATORS.map((s) => (
                <button key={s.id} onClick={() => setIndicator(s.id)} className={`border px-2 py-0.5 text-[10.5px] ${indicator === s.id ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:text-text'}`}>
                  {s.shortLabel}
                  {s.kind === 'estimate' ? '*' : ''}
                </button>
              ))}
            </div>
            <SimChart series={r.astronauts.map((a) => ({ key: a.astronautId, label: nameOf(a.astronautId), color: m.crew.find((c) => c.id === a.astronautId)?.color ?? '#7aa7ff', values: a.daily[indicator] }))} bands={eventBands(m)} cursor={d} onPick={setDay} unit={def.unit} decimals={def.decimals} height={220} />
            <p className="mt-1 text-[10.5px] text-muted">* modeled estimate with no direct sensor. Shaded bands are scheduled events.</p>
          </Panel>
          <Panel title="Who changed" note={`DAY ${d}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[9px] uppercase tracking-[0.14em] text-faint">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-2 font-semibold">Astronaut</th>
                    {(['restingHR', 'hrv', 'sleepDuration', 'sleepQuality', 'fatigue', 'spo2'] as SimIndicator[]).map((k) => (
                      <th key={k} className="px-2 py-2 font-semibold">{SIM_INDICATOR_BY_ID[k].shortLabel}</th>
                    ))}
                    <th className="px-2 py-2 font-semibold">Dose to date</th>
                    <th className="py-2 pl-2 font-semibold">Active alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {r.astronauts.map((a) => {
                    const p = m.crew.find((c) => c.id === a.astronautId)!
                    let dose = 0
                    for (let i = 0; i < d; i++) dose += a.daily.radiationDose[i]
                    const base = p.baseline as unknown as Record<string, number>
                    const baseOf: Partial<Record<SimIndicator, number>> = { restingHR: base.restingHR, hrv: base.hrv, sleepDuration: base.sleepNeed, spo2: base.spo2 }
                    const act = alerts.filter((x) => x.astronautId === a.astronautId && x.active)
                    return (
                      <tr key={a.astronautId} className="cursor-pointer border-b border-border/60 hover:bg-surface-3/40" onClick={() => { setWho(a.astronautId); setView('individual') }}>
                        <td className="py-1.5 pr-2 text-text-strong">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                          {p.name}
                        </td>
                        {(['restingHR', 'hrv', 'sleepDuration', 'sleepQuality', 'fatigue', 'spo2'] as SimIndicator[]).map((k) => {
                          const v = a.daily[k][d - 1]
                          const b = baseOf[k]
                          return (
                            <td key={k} className="mono px-2 py-1.5 text-text">
                              {fmt(v, SIM_INDICATOR_BY_ID[k].decimals)}
                              {b !== undefined && <span className="ml-1 text-[10px] text-faint">({v - b > 0 ? '+' : ''}{fmt(v - b, SIM_INDICATOR_BY_ID[k].decimals)})</span>}
                            </td>
                          )
                        })}
                        <td className="mono px-2 py-1.5 text-text">{fmt(dose, 1)} mSv</td>
                        <td className="py-1.5 pl-2">{act.length ? <Badge tone={act.some((x) => x.level === 'pattern-requiring-investigation') ? 'ember' : 'warn'}>{act.length}</Badge> : <span className="text-muted">none</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10.5px] text-muted">Values for day {d}, with the change from each astronaut's own baseline in brackets. Click a row to open that astronaut.</p>
          </Panel>
          <Panel title="Alerts across the crew" note={`${alerts.length} TO DAY ${d}`}>
            <div className="max-h-[480px] space-y-2 overflow-y-auto">
              {alerts.length === 0 && <p className="text-xs text-muted">No departures from personal baselines detected up to day {d}.</p>}
              {alerts.slice(0, 40).map((a) => (
                <AlertCardSim key={a.id} alert={a} name={nameOf(a.astronautId)} />
              ))}
            </div>
          </Panel>
        </>
      )}

      {view === 'individual' && person && run && (
        <IndividualView m={m} r={r} personId={person.id} day={d} onDay={setDay} onWho={setWho} />
      )}

      {view === 'environment' && (
        <div className="grid gap-4 md:grid-cols-2">
          {ENV_PARAMS.map((p) => {
            const arr = r.environment[p.key]
            const v = arr[d - 1]
            const oor = outOfRange(p.key, v)
            return (
              <Panel key={p.key} title={p.label} note={`${fmt(v, p.decimals)} ${p.unit}${oor ? ` · ${oor.toUpperCase()}` : ''}`}>
                <SimChart series={[{ key: p.key, label: p.label, color: oor ? 'var(--warn)' : 'var(--accent-2)', values: arr }]} bands={eventBands(m)} cursor={d} onPick={setDay} decimals={p.decimals} height={120} reference={ENV_BY_KEY[p.key].reference?.high != null ? { value: ENV_BY_KEY[p.key].reference!.high!, label: 'reference high' } : undefined} />
              </Panel>
            )
          })}
          <p className="text-[10.5px] text-muted md:col-span-2">Shared cabin conditions with crew-wide events applied. Events limited to specific astronauts change their own simulated environment only.</p>
        </div>
      )}

      <Disclaimer>
        Simulated data from an exploratory model with documented assumptions. It is not astronaut telemetry, it does not diagnose or predict medical conditions, and a difference between scenarios is not evidence that a real intervention would have the same effect.
      </Disclaimer>
    </div>
  )
}

export function IndividualView({ m, r, personId, day, onDay, onWho }: { m: MissionConfig; r: SimulationResult; personId: string; day: number; onDay: (d: number) => void; onWho?: (id: string) => void }) {
  const person = m.crew.find((c) => c.id === personId)!
  const run = r.astronauts.find((a) => a.astronautId === personId)!
  const [indicator, setIndicator] = useState<SimIndicator>('restingHR')
  const [hourKey, setHourKey] = useState<HourlyChannel>('heartRate')
  const analysis = useMemo(() => analysisFor(m, r, personId), [m, r, personId])
  const alerts = useMemo(() => crewAlerts(m, r, day).filter((a) => a.astronautId === personId), [m, r, day, personId])
  const summary = useMemo(() => summarise(run, { ...person.baseline, sleepDuration: person.baseline.sleepNeed } as unknown as Record<string, number>), [run, person])
  const def = SIM_INDICATOR_BY_ID[indicator]
  const status = analysis.indicators.some((i) => i.id === indicator) ? analysis.stateAt(indicator, day) : null
  let sleepSum = 0
  let actSum = 0
  for (let i = 0; i < day; i++) {
    sleepSum += run.daily.sleepDuration[i]
    actSum += run.daily.activityMinutes[i]
  }

  return (
    <div className="space-y-4">
      {onWho && (
        <div className="flex flex-wrap gap-1.5">
          {participants(m).filter((c) => r.astronauts.some((a) => a.astronautId === c.id)).map((c) => (
            <button key={c.id} onClick={() => onWho(c.id)} className={`border px-2.5 py-1 text-[11px] ${c.id === personId ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:text-text'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-12">
        <Panel title={`${person.name} · ${person.role}`} note={`DAY ${day}`} className="xl:col-span-5">
          <table className="w-full text-xs">
            <thead className="text-left text-[9px] uppercase tracking-[0.14em] text-faint">
              <tr className="border-b border-border">
                <th className="py-1.5 font-semibold">Indicator</th>
                <th className="py-1.5 font-semibold">Day {day}</th>
                <th className="py-1.5 font-semibold">Baseline</th>
                <th className="py-1.5 font-semibold">Mission mean</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => {
                const dd = SIM_INDICATOR_BY_ID[s.indicator]
                return (
                  <tr key={s.indicator} className={`cursor-pointer border-b border-border/60 hover:bg-surface-3/40 ${indicator === s.indicator ? 'bg-surface-3/50' : ''}`} onClick={() => setIndicator(s.indicator)}>
                    <td className="py-1.5 text-text">
                      {dd.label}
                      {dd.kind === 'estimate' && <span className="ml-1 text-faint">*</span>}
                    </td>
                    <td className="mono py-1.5 text-text-strong">
                      {fmt(run.daily[s.indicator][day - 1], dd.decimals)} <span className="text-faint">{dd.unit}</span>
                    </td>
                    <td className="mono py-1.5 text-muted">{fmt(s.baseline, dd.decimals)}</td>
                    <td className="mono py-1.5 text-muted">{fmt(s.mean, dd.decimals)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10.5px] text-muted">
            * modeled estimate. Sleep to date averages {fmt(sleepSum / day, 1)} h; activity {fmt(actSum / day, 0)} min/day. Baseline column shows the profile's starting values.
          </p>
        </Panel>
        <Panel title={def.label} note={status ? `STATUS: ${status.status.toUpperCase()}` : ''} className="xl:col-span-7">
          <SimChart series={[{ key: indicator, label: def.label, color: person.color, values: run.daily[indicator] }]} bands={eventBands(m, personId)} cursor={day} onPick={onDay} decimals={def.decimals} height={200} reference={summary.find((s) => s.indicator === indicator) && Number.isFinite(summary.find((s) => s.indicator === indicator)!.baseline) ? { value: summary.find((s) => s.indicator === indicator)!.baseline, label: 'profile baseline' } : undefined} />
          {r.resolution === 'hourly' && run.hourly && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <span className="eyebrow-sm mr-2">Hourly on day {day}</span>
                {HOURLY.map((h) => (
                  <button key={h.key} onClick={() => setHourKey(h.key)} className={`border px-2 py-0.5 text-[10.5px] ${hourKey === h.key ? 'border-text-strong text-text-strong' : 'border-border text-muted'}`}>
                    {h.label}
                  </button>
                ))}
              </div>
              <SimChart series={[{ key: hourKey, label: HOURLY.find((h) => h.key === hourKey)!.label, color: person.color, values: run.hourly[hourKey].subarray((day - 1) * 24, day * 24) }]} xLabel="hour" xStart={0} height={140} decimals={hourKey === 'bodyTemp' ? 2 : 1} />
              <p className="mt-1 text-[10.5px] text-muted">Hourly values render the day's modeled state with documented daily shapes (lower heart rate asleep, exercise and EVA periods, circadian temperature rhythm).</p>
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Alerts for this astronaut" note={`${alerts.length} TO DAY ${day}`}>
        <div className="space-y-2">
          {alerts.length === 0 && <p className="text-xs text-muted">No departures from this astronaut's baseline detected up to day {day}.</p>}
          {alerts.map((a) => (
            <AlertCardSim key={a.id} alert={a} />
          ))}
        </div>
      </Panel>
    </div>
  )
}
