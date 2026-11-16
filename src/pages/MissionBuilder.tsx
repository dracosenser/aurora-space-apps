import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Copy, FilePlus2, FileUp, GitBranch, RotateCcw, Rocket, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { CompareView } from '../features/missions/Compare'
import { CrewTab, EnvironmentTab, EventsTab, MissionTab, type Edit, type Focus } from '../features/missions/ConfigTabs'
import { ResultsView } from '../features/missions/Results'
import { Panel } from '../features/workbench/shared'
import { fingerprint, participants, validateConfig, type ValidationIssue } from '../sim/engine'
import { blankMission, duplicateMission, isMission, missionLibrary, scenarioCopy, useMissionLibrary } from '../sim/library'
import { ENV_PARAMS, outOfRange } from '../sim/reference'
import { runMission } from '../sim/runtime'
import { launchControl, useLaunchedMission } from '../sim/launch'
import { useMission } from '../hooks/useMission'
import type { MissionConfig } from '../sim/types'

type Tab = 'library' | 'mission' | 'crew' | 'environment' | 'events' | 'review' | 'results' | 'compare'

// Launching remounts the application; remember where the user was.
let rememberedTab: Tab | null = null

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
  const launched = useLaunchedMission()
  const { setPage } = useMission()
  const [tab, setTabState] = useState<Tab>(rememberedTab ?? (active ? 'review' : 'library'))
  const setTab = (t: Tab) => {
    rememberedTab = t
    setTabState(t)
  }
  const fileRef = useRef<HTMLInputElement>(null)

  // Load the draft whenever a different mission becomes active.
  useEffect(() => {
    setDraft(active)
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
  const [focus, setFocus] = useState<Focus>(null)
  /** Open the tab where a problem is fixed, and the astronaut or event it concerns. */
  const goFix = (i: ValidationIssue) => {
    setTab(i.area)
    setFocus((f) => ({ id: i.targetId, n: (f?.n ?? 0) + 1 }))
  }
  const key = draft ? fingerprint(draft) : ''
  const launchedKey = fingerprint(launched)
  const isLaunched = !!draft && launched.id === draft.id && launchedKey === key
  const run = useMemo(() => (draft && isLaunched ? runMission(draft) : null), [draft, isLaunched])

  // Running a mission launches it: every page in AURORA switches to it.
  const doRun = () => {
    if (!draft || errors.length) return
    missionLibrary.save(draft)
    rememberedTab = 'results'
    launchControl.launch(draft)
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
        description="Start here. Build a mission of any length with your own crew, spacecraft conditions and events, then run it. The run launches the mission across AURORA: Mission Control, Signal Veil, the Medical Monitor, analytics and the Flight Deck all switch to it."
        actions={
          draft ? (
            <Button variant="primary" icon={<Rocket className="h-3.5 w-3.5" />} disabled={errors.length > 0} title={errors.length ? errors.map((e) => e.message).join('\n') : undefined} onClick={doRun}>
              Run and launch
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
          {isLaunched ? <Badge tone="ok">launched · drives every page</Badge> : launched.id === draft.id ? <Badge tone="warn">edited since launch · run to update</Badge> : <Badge>not launched</Badge>}
          <span className="ml-auto text-muted">{errors.length ? <span className="text-danger">Fix {errors.length === 1 ? 'this problem' : `these ${errors.length} problems`} before running ↓</span> : 'Saved automatically in this browser'}</span>
        </div>
      )}

      {draft && errors.length > 0 && <IssueList issues={errors} title="Can't run yet" onGo={goFix} />}

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
                  {m.id === launched.id ? <Badge tone="ok">launched</Badge> : m.id === lib.activeId ? <Badge tone="accent">open</Badge> : null}
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

      {draft && ['mission', 'crew', 'environment', 'events'].includes(tab) && issues.some((i) => i.level === 'warning' && i.area === tab) && (
        <IssueList issues={issues.filter((i) => i.level === 'warning' && i.area === tab)} title="Worth checking on this tab" />
      )}
      {draft && tab === 'mission' && <MissionTab m={draft} edit={edit} />}
      {draft && tab === 'crew' && <CrewTab m={draft} edit={edit} issues={issues} focus={focus} />}
      {draft && tab === 'environment' && <EnvironmentTab m={draft} edit={edit} />}
      {draft && tab === 'events' && <EventsTab m={draft} edit={edit} issues={issues} focus={focus} />}

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
                <li key={k} className={`flex items-start gap-2 ${i.level === 'error' ? 'text-danger' : 'text-warn'}`}>
                  <span className="min-w-0 flex-1">
                    {i.level === 'error' ? 'Fix: ' : 'Note: '}
                    {i.message}
                  </span>
                  <button className="shrink-0 underline underline-offset-2 hover:text-text-strong" onClick={() => goFix(i)}>
                    {AREA_LABEL[i.area]} →
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={<Rocket className="h-3.5 w-3.5" />} disabled={errors.length > 0} title={errors.length ? errors.map((e) => e.message).join('\n') : undefined} onClick={doRun}>
                Run and launch
              </Button>
              <Button
                variant="ghost"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => window.confirm('Reset this mission to a blank two-person configuration? Its name is kept.') && setDraft((d) => (d ? { ...blankMission(), id: d.id, name: d.name, missionCode: d.missionCode } : d))}
              >
                Reset configuration
              </Button>
            </div>
            <p className="mt-3 text-[10.5px] leading-snug text-muted">Running launches the mission across AURORA. The same configuration and seed always produce the same results, so a saved mission is a saved result.</p>
          </Panel>
        </div>
      )}

      {draft && tab === 'results' && run?.result && (
        <div className="mb-4 border border-accent/40 p-4">
          <p className="eyebrow text-text-strong">Launched across AURORA</p>
          <p className="mt-1 text-xs text-muted">This mission now drives every page. Explore it:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ['signal-veil', 'Signal Veil'],
                ['medical', 'Medical Monitor'],
                ['mission-control', 'Mission Control'],
                ['crew-health', 'Crew Health'],
                ['early-warning', 'Early Warning'],
                ['flight-deck', 'Flight Deck'],
                ['assistant', 'Mission Assistant'],
              ] as const
            ).map(([id, label]) => (
              <Button key={id} size="sm" variant={id === 'signal-veil' ? 'primary' : 'outline'} icon={<ArrowRight className="h-3 w-3" />} onClick={() => setPage(id)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {draft && tab === 'results' &&
        (run?.result ? (
          <ResultsView m={draft} r={run.result} />
        ) : run?.error ? (
          <p className="border border-danger/40 px-3 py-2 text-xs text-danger">{run.error}</p>
        ) : (
          <div className="border border-border p-6 text-center">
            <p className="text-sm text-text-strong">{launched.id === draft.id ? 'The configuration changed since this mission was launched.' : 'This mission has not been launched yet.'}</p>
            <p className="mt-1 text-xs text-muted">Running it launches it: Mission Control, Signal Veil, the Medical Monitor and every other page switch to it.</p>
            <Button className="mt-3" variant="primary" icon={<Rocket className="h-3.5 w-3.5" />} disabled={errors.length > 0} title={errors.length ? errors.map((e) => e.message).join('\n') : undefined} onClick={doRun}>
              Run and launch
            </Button>
          </div>
        ))}

      {draft && tab === 'compare' && <CompareView activeId={draft.id} onEditB={(id) => open(id, 'environment')} />}
    </div>
  )
}

const AREA_LABEL: Record<ValidationIssue['area'], string> = {
  mission: 'Mission',
  crew: 'Crew',
  environment: 'Spacecraft conditions',
  events: 'Events',
}

/** Each problem in plain words, with a button that opens the tab where it is fixed. */
function IssueList({ issues, title, onGo }: { issues: ValidationIssue[]; title: string; onGo?: (issue: ValidationIssue) => void }) {
  const isError = issues.some((i) => i.level === 'error')
  return (
    <div className={`mb-4 border px-4 py-3 ${isError ? 'border-danger/50' : 'border-warn/50'}`} role={isError ? 'alert' : 'status'}>
      <p className={`eyebrow ${isError ? 'text-danger' : 'text-warn'}`}>{title}</p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {issues.map((i, k) => (
          <li key={k} className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 text-text">{i.message}</span>
            {onGo && (
              <button className={`shrink-0 border px-2 py-0.5 text-[10px] uppercase tracking-wider hover:text-text-strong ${isError ? 'border-danger/50 text-danger' : 'border-warn/50 text-warn'}`} onClick={() => onGo(i)}>
                Fix in {AREA_LABEL[i.area]}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
