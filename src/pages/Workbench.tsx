import { useEffect, useState } from 'react'
import { Check, FlaskConical } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Analysis } from '../features/workbench/Analysis'
import { CrewRoster } from '../features/workbench/CrewRoster'
import { DataEntry } from '../features/workbench/DataEntry'
import { ImportExport } from '../features/workbench/ImportExport'
import { MissionSetup } from '../features/workbench/MissionSetup'
import { buildExampleWorkspace } from '../workspace/example'
import { countReadings } from '../workspace/ops'
import { useWorkspace, workspaceStore } from '../workspace/store'
import { ENV_SUBJECT } from '../workspace/types'

type Tab = 'mission' | 'crew' | 'data' | 'import' | 'analysis'

const TABS: { id: Tab; label: string }[] = [
  { id: 'mission', label: 'Mission & conditions' },
  { id: 'crew', label: 'Crew' },
  { id: 'data', label: 'Log data' },
  { id: 'import', label: 'Import & export' },
  { id: 'analysis', label: 'Analysis' },
]

/**
 * The Mission Workbench: AURORA as a tool rather than a demonstration.
 *
 * Define your own mission, crew and space conditions, enter or import your own
 * numbers, and run the same Constellation Engine and Signal Veil on them that
 * the demonstration mission uses. Everything stays in this browser.
 */
export function Workbench() {
  const [ws, update] = useWorkspace()
  const total = countReadings(ws)
  const [tab, setTab] = useState<Tab>(() => (total > 0 ? 'analysis' : ws.crew.length > 0 ? 'data' : 'mission'))
  const [subject, setSubject] = useState<string>(ws.crew[0]?.id ?? ENV_SUBJECT)
  const [crewId, setCrewId] = useState<string>(ws.crew[0]?.id ?? '')
  const [notice, setNotice] = useState<string | null>(null)

  // Keep selections valid as the crew changes.
  useEffect(() => {
    if (!ws.crew.some((c) => c.id === crewId)) setCrewId(ws.crew[0]?.id ?? '')
    if (subject !== ENV_SUBJECT && !ws.crew.some((c) => c.id === subject)) setSubject(ws.crew[0]?.id ?? ENV_SUBJECT)
  }, [ws.crew, crewId, subject])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  const steps = [
    { done: ws.mission.name.trim() !== '' && ws.mission.name !== 'My mission', label: 'Name your mission and set its length', tab: 'mission' as Tab },
    { done: ws.crew.length > 0, label: 'Add your crew', tab: 'crew' as Tab },
    { done: total > 0, label: 'Enter or import measurements', tab: 'data' as Tab },
    { done: countReadings(ws, ENV_SUBJECT) > 0, label: 'Log the space conditions', tab: 'data' as Tab },
  ]
  const started = steps.some((s) => s.done)

  return (
    <div>
      <PageHeader
        eyebrow="Operations · Your mission"
        plate="PLATE WB"
        simulated={false}
        title="Mission Workbench"
        description="Bring your own mission. Add your crew, enter or import your own numbers, describe the conditions they are living in, and AURORA analyses them with the same engine and the same visor as the demonstration. Everything stays in this browser."
        actions={
          total === 0 ? (
            <Button
              variant="ember"
              icon={<FlaskConical className="h-3.5 w-3.5" />}
              onClick={() => {
                workspaceStore.set(buildExampleWorkspace())
                setTab('analysis')
                setNotice('Loaded the example mission. Every value in it is synthetic.')
              }}
            >
              Load an example
            </Button>
          ) : undefined
        }
      />

      {/* -------------------------------------------------------- status strip */}
      <div className="mb-6 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="Mission" value={ws.mission.name || 'Unnamed'} note={ws.mission.destination || 'no destination set'} />
        <Cell label="Mission day" value={`${ws.mission.currentDay} of ${ws.mission.totalDays}`} note="latest day with data, of planned length" />
        <Cell label="Crew" value={String(ws.crew.length)} note={ws.crew.map((c) => c.name).join(', ') || 'none added'} />
        <Cell label="Readings on record" value={total.toLocaleString('en-US')} note={`${countReadings(ws, ENV_SUBJECT).toLocaleString('en-US')} of them space conditions`} />
      </div>

      {!steps.every((s) => s.done) && (
        <ol className="mb-6 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label} className="bg-surface">
              <button className="flex w-full items-center gap-2.5 p-3 text-left text-xs transition-colors hover:bg-surface-3/60" onClick={() => { setTab(s.tab); if (i === 3) setSubject(ENV_SUBJECT) }}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${s.done ? 'border-accent text-accent' : 'border-border-strong text-muted'}`}>{s.done ? <Check className="h-3 w-3" /> : <span className="mono text-[9px]">{i + 1}</span>}</span>
                <span className={s.done ? 'text-muted line-through' : 'text-text-strong'}>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {notice && (
        <p className="mb-4 border border-accent/40 px-3 py-2 text-xs text-text-strong" role="status">
          {notice}
        </p>
      )}

      {/* ----------------------------------------------------------------- tabs */}
      <div className="mb-5 flex flex-wrap border-b border-border" role="tablist" aria-label="Workbench sections">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)} className={`relative px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${active ? 'text-text-strong' : 'text-muted hover:text-text'}`}>
              {t.label}
              {active && <span className="absolute inset-x-3 -bottom-px h-px bg-accent" />}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">
        {tab === 'mission' && <MissionSetup ws={ws} update={update} />}
        {tab === 'crew' && (
          <CrewRoster
            ws={ws}
            update={update}
            onLog={(id) => {
              setSubject(id)
              setTab('data')
            }}
          />
        )}
        {tab === 'data' && <DataEntry ws={ws} update={update} subject={subject} onSubject={setSubject} />}
        {tab === 'import' && <ImportExport ws={ws} update={update} onDone={setNotice} />}
        {tab === 'analysis' && <Analysis ws={ws} update={update} crewId={crewId} onCrew={setCrewId} onGoTo={setTab} />}
      </div>

      {!started && (
        <p className="mt-8 text-xs leading-relaxed text-muted">
          New here? Press <span className="text-text-strong">Load an example</span> to see a filled-in mission, then replace it with your own.
        </p>
      )}
    </div>
  )
}

function Cell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 bg-surface p-3.5">
      <p className="eyebrow-sm">{label}</p>
      <p className="mt-1.5 truncate text-[15px] text-text-strong">{value}</p>
      <p className="mt-1 truncate text-[10.5px] text-muted">{note}</p>
    </div>
  )
}
