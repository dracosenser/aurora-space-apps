import { useState } from 'react'
import { Trash2, UserPlus, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Misc'
import { addCrew, countReadings, removeCrew, updateCrew } from '../../workspace/ops'
import type { Workspace } from '../../workspace/types'
import { Field, INPUT, Panel, type Update } from './shared'

/** The user's own crew: add, rename and remove astronauts. */
export function CrewRoster({ ws, update, onLog }: { ws: Workspace; update: Update; onLog: (crewId: string) => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  const add = () => {
    if (!name.trim()) return
    update((w) => addCrew(w, { name, role }))
    setName('')
    setRole('')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Crew" note={`${ws.crew.length} ABOARD`} className="lg:col-span-8">
        {ws.crew.length === 0 ? (
          <EmptyState icon={Users} title="No crew yet" body="Add the people you want to track. Each gets their own measurements, personal baselines and analysis." />
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {ws.crew.map((c) => {
              const n = countReadings(ws, c.id)
              const actions = ws.actions[c.id]?.length ?? 0
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="mono flex h-9 w-9 shrink-0 items-center justify-center border text-[11px]" style={{ borderColor: c.color, color: c.color }}>
                    {c.name
                      .split(/\s+/)
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <input className={INPUT} value={c.name} aria-label={`Name of ${c.id}`} onChange={(e) => update((w) => updateCrew(w, c.id, { name: e.target.value }))} />
                    <input className={INPUT} value={c.role} aria-label={`Role of ${c.name}`} onChange={(e) => update((w) => updateCrew(w, c.id, { role: e.target.value }))} />
                  </div>
                  <span className="annotate w-full sm:w-auto">
                    {c.id} · {n} READING{n === 1 ? '' : 'S'}
                    {actions ? ` · ${actions} ACTION${actions === 1 ? '' : 'S'}` : ''}
                  </span>
                  <Button size="sm" onClick={() => onLog(c.id)}>
                    Log data
                  </Button>
                  <button
                    className="p-1.5 text-muted hover:text-danger"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => {
                      if (n === 0 || window.confirm(`Remove ${c.name} and their ${n} readings? This cannot be undone.`)) update((w) => removeCrew(w, c.id))
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Add a crew member" className="lg:col-span-4">
        <div className="space-y-3">
          <Field label="Name">
            <input className={INPUT} value={name} placeholder="Full name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </Field>
          <Field label="Role">
            <input className={INPUT} value={role} placeholder="Commander, Flight Engineer…" onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </Field>
          <Button variant="primary" icon={<UserPlus className="h-3.5 w-3.5" />} disabled={!name.trim()} onClick={add}>
            Add to crew
          </Button>
        </div>
        <p className="mt-3 text-[10.5px] leading-snug text-muted">Names stay in this browser. Nothing is uploaded.</p>
      </Panel>
    </div>
  )
}
