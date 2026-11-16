import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, FilePlus2, FileUp, GitBranch, Play, RotateCcw, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { CompareView } from '../features/missions/Compare'
import { CrewTab, EnvironmentTab, EventsTab, MissionTab, type Edit } from '../features/missions/ConfigTabs'
import { ResultsView } from '../features/missions/Results'
import { Panel } from '../features/workbench/shared'
import { fingerprint, participants, validateConfig } from '../sim/engine'
import { blankMission, duplicateMission, isMission, missionLibrary, scenarioCopy, useMissionLibrary } from '../sim/library'
import { ENV_PARAMS, outOfRange } from '../sim/reference'
import { runMission } from '../sim/runtime'
import type { MissionConfig } from '../sim/types'

type Tab = 'library' | 'mission' | 'crew' | 'environment' | 'events' | 'review' | 'results' | 'compare'

const TABS: { id: Tab; label: string }[] = [
  { id: 'library', label: 'Missions' },
  { id: 'mission', label: '1 · Mission' },
  { id: 'crew', label: '2 · Crew' },
  { id: 'environment', label: '3 · Spacecraft conditions' },
  { id: 'events', label: '4 · Events' },
  { id: 'review', label: '5 · Review & run' },
  { id: 'results', label: 'Results' },
  { id: 'compare', label: 'Compare scenarios' },
]

/**
 * Mission Builder: create a mission, choose its length, build any crew,
 * set the spacecraft conditions, schedule events, run a reproducible
 * simulation, explore the results and compare scenarios.
 */
export function MissionBuilder() {
  const lib = useMissionLibrary()
  const active = lib.missions.find((m) => m.id === lib.activeId) ?? lib.missions[0] ?? null
  const [draft, setDraft] = useState<MissionConfig | null>(active)
  const [tab, setTab] = useState<Tab>(active ? 'review' : 'library')
  const [ranKey, setRanKey] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load the draft whenever a different mission becomes active.
  useEffect(() => {
    setDraft(active)
    setRanKey(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  // Save edits automatically (debounced) to the library in this browser.
  useEffect(() => {
    if (!draft) return
    const t = window.setTimeout(() => missionLibrary.save(draft), 300)
    return () => window.clearTimeout(t)
  }, [draft])

  const edit: Edit = (fn) => setDraft((d) => (d ? fn(d) : d))
  const issues = useMemo(() => (draft ? validateConfig(draft) : []), [draft])
  const errors = issues.filter((i) => i.level === 'error')
  const key = draft ? fingerprint(draft) : ''
  const run = useMemo(() => (draft && ranKey === key ? runMission(draft) : null), [draft, ranKey, key])

  const doRun = () => {
    if (!draft || errors.length) return
    missionLibrary.save(draft)
    setRanKey(key)
    setTab('results')
  }

  const open = (id: string, to: Tab = 'review') => {
    missionLibrary.setActive(id)
    setTab(to)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations · Simulation"
        plate="PLATE MB"
        title="Mission Builder"
        description="Create a mission of any length, build your own crew, set the spacecraft conditions and schedule events. Run a reproducible simulation of each astronaut's health indicators, see what the detection engine flags and why, and compare scenarios."
        actions={
          draft ? (
            <Button variant="primary" icon={<Play className="h-3.5 w-3.5" />} disabled={errors.length > 0} onClick={doRun}>
              Run simulation
            </Button>
          ) : undefined
        }
      />

      {draft && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border border-border px-4 py-2.5 text-xs">
          <span className="text-text-strong">{draft.name}</span>
          <span className="annotate">
            {draft.missionCode} · {draft.durationDays} DAYS · {participants(draft).length} CREW · {draft.events.length} EVENTS · {draft.resolution.toUpperCase()}
          </span>
          {draft.scenarioOf && <Badge tone="accent">scenario of {lib.missions.find((m) => m.id === draft.scenarioOf)?.name ?? 'another mission'}</Badge>}
          <span className="ml-auto text-muted">{errors.length ? <span className="text-danger">{errors.length} problem(s) to fix before running</span> : 'Saved automatically in this browser'}</span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} disabled={!draft && t.id !== 'library'} className={`relative px-3.5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:opacity-40 ${tab === t.id ? 'text-text-strong' : 'text-muted hover:text-text'}`}>
            {t.label}
            {tab === t.id && <span className="absolute inset-x-3 -bottom-px h-px bg-accent" />}
          </button>
        ))}
      </div>

      {tab === 'library' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<FilePlus2 className="h-3.5 w-3.5" />} onClick={() => { const m = blankMission(); missionLibrary.add(m); setTab('mission') }}>
              New mission
            </Button>
            <Button icon={<FileUp className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
              Load mission file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                f.text().then((t) => {
                  try {
                    const m = JSON.parse(t)
                    if (!isMission(m)) throw new Error()
                    missionLibrary.add({ ...m, id: `${m.id}-${Date.now().toString(36)}` })
                    setTab('review')
                  } catch {
                    window.alert('That file is not an AURORA mission.')
                  }
                })
                e.target.value = ''
              }}
            />
            <Button variant="ghost" onClick={() => missionLibrary.restoreExamples()}>
              Add example missions
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lib.missions.map((m) => (
              <section key={m.id} className={`panel p-4 ${m.id === lib.activeId ? 'border-accent/60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-strong">{m.name}</p>
                    <p className="annotate mt-0.5">
                      {m.missionCode} · {m.destination}
                    </p>
                  </div>
                  {m.id === lib.activeId && <Badge tone="accent">open</Badge>}
                </div>
                <p className="mono mt-2 text-[11px] text-muted">
                  {m.durationDays} days · {participants(m).length} crew · {m.events.length} events · seed {m.seed}
                </p>
                {m.scenarioOf && <p className="mt-1 text-[10.5px] text-accent">Scenario of {lib.missions.find((x) => x.id === m.scenarioOf)?.name ?? 'a deleted mission'}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" onClick={() => open(m.id)}>Open</Button>
                  <Button size="sm" icon={<GitBranch className="h-3 w-3" />} title="Copy with the same seed and crew, for comparison" onClick={() => { const c = scenarioCopy(m); missionLibrary.add(c); setTab('environment') }}>
                    Scenario
                  </Button>
                  <Button size="sm" icon={<Copy className="h-3 w-3" />} title="Independent copy" onClick={() => missionLibrary.add(duplicateMission(m), false)}>
                    Duplicate
                  </Button>
                  <button className="ml-auto p-1.5 text-muted hover:text-danger" aria-label={`Delete ${m.name}`} onClick={() => window.confirm(`Delete "${m.name}" from this browser?`) && missionLibrary.remove(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </section>
            ))}
          </div>
          {lib.missions.length === 0 && <p className="text-xs text-muted">No missions yet. Create one or add the examples.</p>}
        </div>
      )}

      {draft && tab === 'mission' && <MissionTab m={draft} edit={edit} />}
      {draft && tab === 'crew' && <CrewTab m={draft} edit={edit} />}
      {draft && tab === 'environment' && <EnvironmentTab m={draft} edit={edit} />}
      {draft && tab === 'events' && <EventsTab m={draft} edit={edit} />}

      {draft && tab === 'review' && (
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel title="Configuration" className="lg:col-span-7">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                ['Mission', `${draft.name} (${draft.missionCode})`],
                ['Destination', draft.destination],
                ['Start date', draft.startDate],
                ['Duration', `${draft.durationDays} days, ${draft.resolution}`],
                ['Seed', String(draft.seed)],
                ['Spacecraft', draft.spacecraft.name],
                ['Crew flying', participants(draft).map((c) => c.name).join(', ') || 'none'],
                ['Events', draft.events.map((e) => `${e.title} (d${e.startDay})`).join(', ') || 'none'],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-text">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="eyebrow-sm mb-1.5 mt-4">Spacecraft conditions</p>
            <div className="flex flex-wrap gap-1.5">
              {ENV_PARAMS.map((p) => {
                const v = draft.environment[p.key]
                const o = outOfRange(p.key, v)
                return (
                  <span key={p.key} className={`border px-2 py-0.5 text-[11px] ${o ? 'border-warn/60 text-warn' : 'border-border text-muted'}`}>
                    {p.label}: <span className="mono">{v} {p.unit}</span>
                  </span>
                )
              })}
            </div>
          </Panel>
          <Panel title="Checks" className="lg:col-span-5">
            {issues.length === 0 ? <p className="text-xs text-ok">Ready to run.</p> : null}
            <ul className="space-y-1.5 text-xs">
              {issues.map((i, k) => (
                <li key={k} className={i.level === 'error' ? 'text-danger' : 'text-warn'}>
                  {i.level === 'error' ? 'Fix: ' : 'Note: '}
                  {i.message}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={<Play className="h-3.5 w-3.5" />} disabled={errors.length > 0} onClick={doRun}>
                Run simulation
              </Button>
              <Button
                variant="ghost"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => window.confirm('Reset this mission to a blank two-person configuration? Its name is kept.') && setDraft((d) => (d ? { ...blankMission(), id: d.id, name: d.name, missionCode: d.missionCode } : d))}
              >
                Reset configuration
              </Button>
            </div>
            <p className="mt-3 text-[10.5px] leading-snug text-muted">The same configuration and seed always produce the same results, so a saved mission is a saved result. Export the numbers from the Results tab.</p>
          </Panel>
        </div>
      )}

      {draft && tab === 'results' &&
        (run?.result ? (
          <ResultsView m={draft} r={run.result} />
        ) : run?.error ? (
          <p className="border border-danger/40 px-3 py-2 text-xs text-danger">{run.error}</p>
        ) : (
          <div className="border border-border p-6 text-center">
            <p className="text-sm text-text-strong">{ranKey ? 'The configuration changed since the last run.' : 'This mission has not been run yet.'}</p>
            <Button className="mt-3" variant="primary" icon={<Play className="h-3.5 w-3.5" />} disabled={errors.length > 0} onClick={doRun}>
              Run simulation
            </Button>
          </div>
        ))}

      {draft && tab === 'compare' && <CompareView activeId={draft.id} onEditB={(id) => open(id, 'environment')} />}
    </div>
  )
}
