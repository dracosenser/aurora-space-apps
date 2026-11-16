import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Stethoscope } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Disclaimer, EmptyState } from '../components/ui/Misc'
import { useMission } from '../hooks/useMission'
import { AlertCardSim, IndividualView, fmt } from '../features/missions/Results'
import { SignalVeilExperience } from '../features/signal-veil'
import { InsightPanel } from '../features/signal-veil/ui/InsightPanel'
import { colorForCategory } from '../features/signal-veil/model/layout'
import { Panel } from '../features/workbench/shared'
import { datasetForAstronaut } from '../sim/analyze'
import { eventsDuring, participants } from '../sim/engine'
import { missionLibrary, useMissionLibrary } from '../sim/library'
import { SIM_INDICATORS } from '../sim/reference'
import { analysisFor, crewAlerts, useActiveSimulation } from '../sim/runtime'

const NOTES_KEY = 'aurora.medical.notes.v1'

function loadNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Medical monitoring for the active simulated mission. One data source: the
 * simulation run shared with the Mission Builder. Select any astronaut, see
 * current values against their baseline, trends, alerts with explanations,
 * the Constellation Engine's findings, and open Signal Veil on their data.
 */
export function MedicalMonitor() {
  const lib = useMissionLibrary()
  const { config, result, error } = useActiveSimulation()
  const { setPage } = useMission()
  const crew = config && result ? participants(config).filter((c) => result.astronauts.some((a) => a.astronautId === c.id)) : []
  const [who, setWho] = useState('')
  const [day, setDay] = useState(1)
  const [veil, setVeil] = useState(false)
  const [notes, setNotes] = useState(loadNotes)

  useEffect(() => {
    if (result) setDay(result.days)
    setVeil(false)
  }, [result])
  const person = crew.find((c) => c.id === who) ?? crew[0]
  const alerts = useMemo(() => (config && result ? crewAlerts(config, result, Math.min(day, result.days)) : []), [config, result, day])
  const analysis = useMemo(() => (config && result && person ? analysisFor(config, result, person.id) : null), [config, result, person])
  const dataset = useMemo(() => (config && result && person ? datasetForAstronaut(config, result, person.id) : null), [config, result, person])

  if (!config || !result) {
    return (
      <div>
        <PageHeader eyebrow="Operations · Medical" title="Medical Monitor" description="Monitoring for the active simulated mission." />
        <EmptyState icon={Stethoscope} title="No runnable mission" body={error ?? 'Create or open a mission in the Mission Builder.'} action={<Button onClick={() => setPage('missions')}>Open Mission Builder</Button>} />
      </div>
    )
  }
  const d = Math.min(day, result.days)
  const noteKey = `${config.id}:${person?.id}`
  const colorOf = (id: string) => {
    const ind = dataset?.indicators.find((i) => i.id === id)
    return colorForCategory(ind?.category ?? '', 0)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations · Medical"
        plate="PLATE MED"
        title="Medical Monitor"
        description="Select any astronaut on the active mission: current simulated measurements against their baseline, trends, monitoring alerts with their explanation, the events around each change, and Signal Veil on their data. Simulated data; not a diagnostic system."
        actions={
          <Button variant="outline" onClick={() => setPage('missions')}>
            Edit mission
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border px-4 py-3">
        <span className="eyebrow-sm">Active mission</span>
        <select className="h-8 border border-border-strong bg-transparent px-2 text-sm text-text-strong" value={config.id} onChange={(e) => missionLibrary.setActive(e.target.value)}>
          {lib.missions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <label className="flex min-w-56 flex-1 items-center gap-3">
          <span className="eyebrow-sm">Mission day</span>
          <input type="range" min={1} max={result.days} value={d} onChange={(e) => setDay(Number(e.target.value))} style={{ ['--fill' as string]: `${((d - 1) / Math.max(1, result.days - 1)) * 100}%` }} aria-label="Mission day" />
          <span className="mono w-16 text-right text-sm text-text-strong">
            {d}/{result.days}
          </span>
        </label>
      </div>

      {/* Crew board */}
      <div className="mb-4 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {crew.map((c) => {
          const run = result.astronauts.find((a) => a.astronautId === c.id)!
          const act = alerts.filter((a) => a.astronautId === c.id && a.active)
          const on = person?.id === c.id
          return (
            <button key={c.id} onClick={() => { setWho(c.id); setVeil(false) }} className={`bg-surface p-3 text-left transition-colors hover:bg-surface-3/60 ${on ? 'outline outline-1 -outline-offset-1 outline-accent' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="truncate text-sm text-text-strong">{c.name}</span>
                {act.length > 0 ? <Badge tone={act.some((a) => a.level === 'pattern-requiring-investigation') ? 'ember' : 'warn'}>{act.length} alert{act.length > 1 ? 's' : ''}</Badge> : <Badge tone="ok">no alerts</Badge>}
              </div>
              <p className="mono mt-1.5 text-[11px] text-muted">
                HR {fmt(run.daily.restingHR[d - 1], 0)} (base {c.baseline.restingHR}) · SpO₂ {fmt(run.daily.spo2[d - 1], 1)} · sleep {fmt(run.daily.sleepDuration[d - 1], 1)} h
              </p>
              <p className="text-[10.5px] text-faint">{c.role}</p>
            </button>
          )
        })}
      </div>

      {person && analysis && dataset && (
        <div className="space-y-4">
          <IndividualView m={config} r={result} personId={person.id} day={d} onDay={setDay} />

          <div className="grid gap-4 xl:grid-cols-12">
            <Panel title="Events around this astronaut" note={`DAYS ${Math.max(1, d - 14)}–${d}`} className="xl:col-span-4">
              {eventsDuring(config, person.id, Math.max(1, d - 14), d).length === 0 ? (
                <p className="text-xs text-muted">No scheduled events in the last two weeks.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {eventsDuring(config, person.id, Math.max(1, d - 14), d).map((e) => (
                    <li key={e.id} className="border-b border-border/60 pb-1.5">
                      <span className="text-text-strong">{e.title}</span> <span className="annotate">DAY {e.startDay}{e.durationDays > 1 ? `–${e.startDay + e.durationDays - 1}` : ''}</span>
                      {e.notes && <p className="text-muted">{e.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="eyebrow-sm mb-1.5 mt-4">Monitoring notes</p>
              <textarea
                className="h-28 w-full resize-y border border-border-strong bg-transparent p-2 text-xs text-text-strong outline-none focus:border-accent"
                placeholder={`Notes about ${person.name} on this mission`}
                value={notes[noteKey] ?? ''}
                onChange={(e) => {
                  const next = { ...notes, [noteKey]: e.target.value }
                  setNotes(next)
                  try {
                    localStorage.setItem(NOTES_KEY, JSON.stringify(next))
                  } catch {
                    /* ignore */
                  }
                }}
              />
              <p className="mt-1 text-[10.5px] text-muted">Saved in this browser with the mission.</p>
            </Panel>
            <Panel title="Constellation Engine" note="JOINT PATTERNS, TRENDS, EVIDENCE" className="xl:col-span-8">
              <div className="max-h-[560px] overflow-y-auto">
                <InsightPanel insights={analysis.insightsAt(d)} day={d} onSelectIndicator={() => undefined} colorOf={colorOf} />
              </div>
            </Panel>
          </div>

          <Panel title="Crew alerts" note={`${alerts.filter((a) => a.active).length} ACTIVE ON DAY ${d}`}>
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {alerts.filter((a) => a.active).length === 0 && <p className="text-xs text-muted">No active monitoring alerts on day {d}.</p>}
              {alerts.filter((a) => a.active).map((a) => (
                <AlertCardSim key={a.id} alert={a} name={config.crew.find((c) => c.id === a.astronautId)?.name} />
              ))}
            </div>
          </Panel>

          <div className="border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-xl">
                <p className="eyebrow text-text-strong">Signal Veil · {person.name}</p>
                <p className="mt-1 text-xs text-muted">Open this astronaut's simulated signals and the cabin conditions in the visor: wipe it, draw connections between signals, replay the mission.</p>
              </div>
              <Button variant={veil ? 'outline' : 'primary'} icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => setVeil((v) => !v)}>
                {veil ? 'Close the visor' : 'Open Signal Veil'}
              </Button>
            </div>
            {veil && (
              <div className="mt-5">
                <SignalVeilExperience key={`${result.fingerprint}-${person.id}`} dataset={dataset} analysis={analysis} initialDay={d} />
              </div>
            )}
          </div>
          <p className="text-[10.5px] text-muted">Indicators: {SIM_INDICATORS.map((i) => `${i.shortLabel}${i.kind === 'estimate' ? ' (modeled estimate)' : ''}`).join(' · ')}.</p>
        </div>
      )}

      <Disclaimer className="mt-6">
        Every value on this page is simulated by AURORA's exploratory model. Alerts describe departures from an astronaut's own simulated baseline. They are monitoring prompts for human review, not diagnoses, and coinciding events do not establish cause.
      </Disclaimer>
    </div>
  )
}
