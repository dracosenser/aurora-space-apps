import { useEffect, useMemo, useState } from 'react'
import { LineChart, Sparkles, Users } from 'lucide-react'
import { createMissionAnalysis } from '../../engine/analysis'
import { resolveConfig } from '../../engine/config'
import { STATUS_LABEL } from '../../engine/explain'
import { isSparse } from '../../engine/timeline'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { Disclaimer, EmptyState } from '../../components/ui/Misc'
import { addAction, removeAction } from '../../workspace/ops'
import { datasetForCrew, engineConfigFor } from '../../workspace/dataset'
import type { BaselineChoice, Workspace } from '../../workspace/types'
import { SignalVeilExperience } from '../signal-veil'
import { colorForCategory } from '../signal-veil/model/layout'
import { InsightPanel } from '../signal-veil/ui/InsightPanel'
import { HistoryChart } from '../signal-veil/ui/charts'
import { ProvenanceTag, StatusBadge, num, signed } from '../signal-veil/ui/shared'
import { RadiationCard } from './MissionSetup'
import { Panel, type Update } from './shared'

/**
 * Runs the Constellation Engine on the user's own mission: personal baselines,
 * deviations, joint patterns, relationships between health signals and space
 * conditions, and the visor.
 */
export function Analysis({ ws, update, crewId, onCrew, onGoTo }: { ws: Workspace; update: Update; crewId: string; onCrew: (id: string) => void; onGoTo: (tab: 'crew' | 'data') => void }) {
  const [day, setDay] = useState(ws.mission.currentDay)
  const [focus, setFocus] = useState<string | null>(null)
  const [visor, setVisor] = useState(false)
  useEffect(() => setDay(ws.mission.currentDay), [ws.mission.currentDay])

  const member = ws.crew.find((c) => c.id === crewId)
  const dataset = useMemo(() => (member ? datasetForCrew(ws, member.id) : null), [ws, member])
  const config = useMemo(() => engineConfigFor(ws), [ws])
  const run = useMemo(() => {
    if (!dataset || dataset.indicators.length === 0) return null
    const t0 = performance.now()
    const analysis = createMissionAnalysis(dataset, config)
    return { analysis, ms: performance.now() - t0 }
  }, [dataset, config])

  if (ws.crew.length === 0) {
    return <EmptyState icon={Users} title="Nothing to analyse yet" body="Add a crew member and some measurements, or load the example mission from Import & export." action={<Button onClick={() => onGoTo('crew')}>Add crew</Button>} />
  }
  if (!member || !dataset || !run) {
    return (
      <div className="space-y-4">
        <CrewPicker ws={ws} crewId={crewId} onCrew={onCrew} />
        <EmptyState icon={LineChart} title={`No measurements for ${member?.name ?? 'this crew member'} yet`} body="Enter a few days of readings under Log data. The engine needs about two weeks of a signal before it will compare anything against a personal baseline." action={<Button onClick={() => onGoTo('data')}>Log data</Button>} />
      </div>
    )
  }

  const { analysis, ms } = run
  const cfg = resolveConfig(config)
  const d = Math.min(day, dataset.totalDays)
  const colors = new Map(dataset.indicators.map((i) => [i.id, colorForCategory(i.category, dataset.categories.findIndex((c) => c.id === i.category))]))
  const colorOf = (id: string) => colors.get(id) ?? '#7aa7ff'
  const insights = analysis.insightsAt(d)
  const joint = analysis.jointAt(d)
  const patterns = analysis.patternsAt(d).filter((p) => p.active)
  const supported = analysis.relationshipsAt(d).filter((r) => r.status === 'supported')
  const isContext = (id: string) => analysis.timelineOf(id).def.role === 'context'
  const focusId = focus && analysis.indicators.some((i) => i.id === focus) ? focus : null
  const findings = insights.filter((i) => i.kind !== 'normal-variation').length
  const waiting = analysis.timelines.filter((t) => t.states[d - 1].status === 'insufficient-data').length

  return (
    <div className="space-y-4">
      <CrewPicker ws={ws} crewId={crewId} onCrew={onCrew} />

      <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        <Readout label="As of mission day" value={String(d)} note={`of ${dataset.totalDays} with data`} />
        <Readout label="Signals analysed" value={String(analysis.indicators.length)} note={waiting ? `${waiting} still building a baseline` : 'all have a baseline'} />
        <Readout label="Joint statistic" value={joint ? num(joint.t2, 0) : '—'} note={joint ? `limit ${num(joint.limit, 1)}${joint.exceeds ? ' · exceeded' : ''}` : `starts after day ${analysis.jointModel.startDay - 1}`} tone={joint?.exceeds ? 'ember' : undefined} />
        <Readout label="Joint patterns" value={String(patterns.length)} note={patterns.length ? `${patterns[0].coreMemberIds.length} signals, ${patterns[0].stage}` : 'none reported'} tone={patterns.length ? 'ember' : undefined} />
        <Readout label="Relationships supported" value={String(supported.length)} note={`engine ran in ${ms.toFixed(0)} ms`} />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border border-border px-4 py-3">
        <label className="flex min-w-56 flex-1 items-center gap-3">
          <span className="eyebrow-sm shrink-0">View as of day</span>
          <input type="range" min={1} max={dataset.totalDays} value={d} onChange={(e) => setDay(Number(e.target.value))} style={{ ['--fill' as string]: `${((d - 1) / Math.max(1, dataset.totalDays - 1)) * 100}%` }} aria-label="Analysis day" />
          <span className="mono w-10 text-right text-sm text-text-strong">{d}</span>
        </label>
        <span className="flex items-center gap-2">
          <span className="eyebrow-sm">Baseline</span>
          <Segmented<BaselineChoice>
            size="sm"
            value={ws.baseline}
            onChange={(v) => update((w) => ({ ...w, baseline: v }))}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'reference', label: 'First days' },
              { value: 'rolling', label: 'Rolling' },
            ]}
          />
        </span>
        <span className="annotate">
          {cfg.baseline.mode === 'reference' ? `FIRST ${cfg.baseline.referenceDays} DAYS` : `TRAILING ${cfg.baseline.rollingWindowDays} DAYS`} · NEEDS {cfg.baseline.minObservations} READINGS
        </span>
        <ProvenanceTag provenance={dataset.provenance} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel title="Signals" note="CLICK A ROW FOR ITS HISTORY" className="xl:col-span-7">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[9px] uppercase tracking-[0.14em] text-faint">
                <tr className="border-b border-border">
                  <th className="py-2 pr-2 font-semibold">Signal</th>
                  <th className="px-2 py-2 font-semibold">Latest</th>
                  <th className="px-2 py-2 font-semibold">Your baseline</th>
                  <th className="px-2 py-2 font-semibold">Change</th>
                  <th className="px-2 py-2 font-semibold">Shift</th>
                  <th className="py-2 pl-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {analysis.timelines.map((tl) => {
                  const s = tl.states[d - 1]
                  const b = s.baseline && s.baseline.status !== 'insufficient' ? s.baseline : null
                  const have = tl.clean.slice(0, d).filter((v) => v !== null).length
                  const need = (isSparse(tl.def) ? cfg.baseline.minSparseObservations : cfg.baseline.minObservations) - Math.min(have, s.baseline?.n ?? have)
                  const on = focusId === tl.def.id
                  return (
                    <tr key={tl.def.id} className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-3/50 ${on ? 'bg-surface-3/60' : ''}`} onClick={() => setFocus(on ? null : tl.def.id)}>
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-2 text-text-strong">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(tl.def.id) }} />
                          {tl.def.label}
                          {tl.def.role === 'context' && <span className="annotate text-ember">CONDITION</span>}
                        </span>
                      </td>
                      <td className="mono px-2 py-2 text-text-strong">
                        {num(s.lastValue, tl.def.decimals)} <span className="text-faint">{tl.def.unit}</span>
                      </td>
                      <td className="mono px-2 py-2 text-muted">{b ? `${num(b.median, tl.def.decimals)} ± ${num(b.scale, Math.max(1, tl.def.decimals))}` : '—'}</td>
                      <td className="mono px-2 py-2 text-text">{s.percentChange !== null ? `${signed(s.percentChange, 0)}%` : '—'}</td>
                      <td className="mono px-2 py-2 text-text">{signed(s.shift, 1)}</td>
                      <td className="py-2 pl-2">
                        <StatusBadge status={s.status} />
                        {s.status === 'insufficient-data' && need > 0 && <span className="ml-2 text-[10.5px] text-muted">{need} more reading{need === 1 ? '' : 's'} needed</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {focusId && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="eyebrow-sm mb-2">
                {analysis.timelineOf(focusId).def.label} · {STATUS_LABEL[analysis.stateAt(focusId, d).status]}
              </p>
              <HistoryChart analysis={analysis} indicatorId={focusId} day={d} range="all" color={colorOf(focusId)} actions={dataset.actions} onPickDay={setDay} />
            </div>
          )}
        </Panel>

        <div className="space-y-4 xl:col-span-5">
          <Panel title="Relationships the data supports" note={`${supported.length} ON DAY ${d}`}>
            {supported.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted">None yet. A relationship is only reported once two signals share at least {cfg.relationship.minPairs} days and their day-to-day changes are associated beyond chance.</p>
            ) : (
              <ul className="space-y-1.5">
                {supported.map((r) => {
                  const condition = isContext(r.a) || isContext(r.b)
                  return (
                    <li key={r.id} className="border border-border px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 text-text-strong">
                          {analysis.timelineOf(r.leader).def.label} {r.lagDays > 0 ? '→' : '↔'} {analysis.timelineOf(r.follower).def.label}
                        </span>
                        <span className="mono shrink-0 text-accent-2">ρ {num(r.rho, 2)}</span>
                      </div>
                      <p className="annotate mt-0.5">
                        {r.lagDays > 0 ? `${r.lagDays} DAY LEAD` : 'SAME DAY'} · {r.nPairs} PAIRED DAYS{condition ? ' · ' : ''}
                        {condition && <span className="text-ember">SPACE CONDITION</span>}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-2 text-[10.5px] leading-snug text-muted">Associations in day-to-day changes. None shows that one thing causes another.</p>
          </Panel>
          <RadiationCard ws={ws} />
        </div>
      </div>

      <Panel title="What the engine sees" note={`${findings} FINDING${findings === 1 ? '' : 'S'}`}>
        <InsightPanel insights={insights} day={d} colorOf={colorOf} onSelectIndicator={setFocus} />
      </Panel>

      <div className="border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-xl">
            <p className="eyebrow text-text-strong">Through the visor</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Open {member.name}'s signals and the space conditions in Signal Veil: wipe the visor, draw connections, replay the mission, and record a protocol action to follow what the numbers did afterwards.</p>
          </div>
          <Button variant={visor ? 'outline' : 'primary'} icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => setVisor((v) => !v)}>
            {visor ? 'Close the visor' : 'Open in Signal Veil'}
          </Button>
        </div>
        {visor && (
          <div className="mt-5">
            <SignalVeilExperience
              key={member.id}
              dataset={dataset}
              analysis={analysis}
              initialDay={d}
              onRecordAction={(a) => update((w) => addAction(w, member.id, a))}
              onRemoveAction={(id) => update((w) => removeAction(w, member.id, id))}
            />
          </div>
        )}
      </div>

      <Disclaimer>
        Everything here describes departures from this person's own baseline in the numbers you entered. It is not a diagnosis, a baseline is not a statement of what is healthy, and nothing on this page recommends a treatment.
      </Disclaimer>
    </div>
  )
}

function CrewPicker({ ws, crewId, onCrew }: { ws: Workspace; crewId: string; onCrew: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border border-border px-4 py-3">
      <span className="eyebrow-sm shrink-0">Analysing</span>
      <div className="flex flex-wrap gap-1.5">
        {ws.crew.map((c) => (
          <button key={c.id} onClick={() => onCrew(c.id)} aria-pressed={crewId === c.id} className={`border px-2.5 py-1 text-[11px] transition-colors ${crewId === c.id ? 'border-text-strong text-text-strong' : 'border-border text-muted hover:border-border-strong hover:text-text'}`}>
            {c.name}
          </button>
        ))}
      </div>
      <span className="annotate ml-auto">
        {ws.mission.name.toUpperCase()}
        {ws.mission.destination ? ` · ${ws.mission.destination.toUpperCase()}` : ''}
      </span>
    </div>
  )
}

function Readout({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'ember' }) {
  return (
    <div className="bg-surface p-3.5">
      <p className="eyebrow-sm">{label}</p>
      <p className={`mono mt-1.5 text-2xl leading-none ${tone === 'ember' ? 'text-ember' : 'text-text-strong'}`}>{value}</p>
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted">{note}</p>
    </div>
  )
}
