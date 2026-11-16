import { useMemo, useRef, useState } from 'react'
import { Download, Eraser, FileUp, FlaskConical, HeartPulse, Upload } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useMission } from '../../hooks/useMission'
import { downloadText } from '../../lib/report'
import { csvTemplate, parseReadings, toCsv } from '../../workspace/csv'
import { SELF_CHECK_MAP, selfCheckRows } from '../../workspace/dataset'
import { buildExampleWorkspace } from '../../workspace/example'
import { countReadings, parseWorkspace, setReadings } from '../../workspace/ops'
import { workspaceStore } from '../../workspace/store'
import { ENV_SUBJECT, type Workspace } from '../../workspace/types'
import { Field, INPUT, Panel, type Update } from './shared'

const SAMPLE = `day,subject,restingHR,sleepDuration,fatigue,cabinCO2
1,CREW NAME,58,6.9,3.2,2.6
2,CREW NAME,57,7.1,3.0,2.7`

/** Bring numbers in from a spreadsheet or the Self-Assessment page, and take everything out again. */
export function ImportExport({ ws, update, onDone }: { ws: Workspace; update: Update; onDone: (message: string) => void }) {
  const mission = useMission()
  const [text, setText] = useState('')
  const [fallback, setFallback] = useState<string>(ws.crew[0]?.id ?? '')
  const [selfTarget, setSelfTarget] = useState<string>(ws.crew[0]?.id ?? '')
  const fileRef = useRef<HTMLInputElement>(null)

  const preview = useMemo(() => (text.trim() ? parseReadings(text, ws, fallback || null) : null), [text, ws, fallback])
  const total = countReadings(ws)
  const selfReadings = mission.log.readings.filter((r) => SELF_CHECK_MAP[r.id])
  const stem = (ws.mission.name || 'mission').replace(/[^a-z0-9]+/gi, '-').toLowerCase()

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result ?? '')
      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          const loaded = parseWorkspace(JSON.parse(content))
          if (!loaded) return onDone('That file is not an AURORA mission file.')
          if (total > 0 && !window.confirm(`Replace the current mission (${total} readings) with "${loaded.mission.name}"?`)) return
          workspaceStore.set(loaded)
          onDone(`Loaded "${loaded.mission.name}": ${loaded.crew.length} crew, ${countReadings(loaded)} readings.`)
        } catch {
          onDone('That file could not be read as JSON.')
        }
      } else {
        setText(content)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Import measurements" note="CSV · PASTE OR FILE" className="lg:col-span-7">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Paste rows from a spreadsheet, or choose a file. One column must be <span className="mono text-text">day</span>. Use one column per indicator, or the long layout <span className="mono text-text">day, subject, indicator, value</span>. People and indicators are matched by name.
        </p>
        <textarea
          className="mono h-40 w-full resize-y border border-border-strong bg-transparent p-2.5 text-[12px] leading-relaxed text-text-strong outline-none placeholder:text-faint focus:border-accent"
          placeholder={SAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="CSV to import"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="If a row names no one, use" className="w-56">
            <select className={INPUT} value={fallback} onChange={(e) => setFallback(e.target.value)}>
              <option value="">No one (skip those rows)</option>
              {ws.crew.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button size="sm" icon={<FileUp className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
            Choose a file
          </Button>
          <Button size="sm" variant="ghost" onClick={() => downloadText(`${stem}-template.csv`, csvTemplate(ws), 'text/csv')}>
            Download a template
          </Button>
        </div>

        {preview && (
          <div className="mt-4 border border-border p-3">
            <p className="eyebrow-sm">Preview · {preview.format === 'unknown' ? 'not recognised' : `${preview.format} layout`}</p>
            <p className="mono mt-1.5 text-lg text-text-strong">
              {preview.rows.length} <span className="text-sm text-muted">reading{preview.rows.length === 1 ? '' : 's'} ready</span>
            </p>
            <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-muted">
              {preview.unknownSubjects.length > 0 && (
                <li>
                  <span className="text-ember">Not in your crew, skipped:</span> {preview.unknownSubjects.join(', ')}. Add them under Crew first.
                </li>
              )}
              {preview.unknownIndicators.length > 0 && (
                <li>
                  <span className="text-ember">Unknown columns, skipped:</span> {preview.unknownIndicators.join(', ')}. Add them as your own indicators under Log data to import them.
                </li>
              )}
              {preview.implausible > 0 && <li>{preview.implausible} value{preview.implausible === 1 ? ' is' : 's are'} outside the plausible range. They will be imported but excluded from analysis.</li>}
              {preview.errors.map((e) => (
                <li key={e} className="text-danger">
                  {e}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={<Upload className="h-3.5 w-3.5" />}
                disabled={preview.rows.length === 0}
                onClick={() => {
                  update((w) => setReadings(w, preview.rows, 'imported'))
                  onDone(`Imported ${preview.rows.length} readings.`)
                  setText('')
                }}
              >
                Import {preview.rows.length} reading{preview.rows.length === 1 ? '' : 's'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setText('')}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <div className="space-y-4 lg:col-span-5">
        <Panel title="From the Self-Assessment page" note={`${selfReadings.length} READING${selfReadings.length === 1 ? '' : 'S'} AVAILABLE`}>
          <p className="text-xs leading-relaxed text-muted">Readings you took on the Self-Assessment page (blood pressure, heart rate, SpO₂, temperature, glucose, sleep, mood) can be added to a crew member here. The most recent is placed on mission day {ws.mission.currentDay}.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Add them to" className="min-w-40 flex-1">
              <select className={INPUT} value={selfTarget} onChange={(e) => setSelfTarget(e.target.value)}>
                <option value="">Choose a crew member</option>
                {ws.crew.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              size="sm"
              icon={<HeartPulse className="h-3.5 w-3.5" />}
              disabled={!selfTarget || selfReadings.length === 0}
              onClick={() => {
                const rows = selfCheckRows(mission.log.readings, selfTarget, ws.mission.currentDay)
                update((w) => setReadings(w, rows, 'user-entered'))
                onDone(`Added ${rows.length} Self-Assessment readings.`)
              }}
            >
              Add readings
            </Button>
          </div>
          {selfReadings.length === 0 && <p className="mt-2 text-[10.5px] text-muted">None yet. Take a reading on the Self-Assessment page and it will appear here.</p>}
        </Panel>

        <Panel title="Export" note={`${total} READING${total === 1 ? '' : 'S'}`}>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} disabled={total === 0} onClick={() => downloadText(`${stem}-readings.csv`, toCsv(ws), 'text/csv')}>
              Readings as CSV
            </Button>
            <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(`${stem}.aurora.json`, JSON.stringify(ws, null, 2), 'application/json')}>
              Whole mission as JSON
            </Button>
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-muted">The JSON file holds everything (crew, readings, conditions, phases, events, actions) and can be loaded back with “Choose a file”. Share it with a teammate to hand over a mission.</p>
        </Panel>

        <Panel title="Start over or explore">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ember"
              icon={<FlaskConical className="h-3.5 w-3.5" />}
              onClick={() => {
                if (total > 0 && !window.confirm('Replace the current mission with the synthetic example?')) return
                workspaceStore.set(buildExampleWorkspace())
                onDone('Loaded the example mission. Every value in it is synthetic.')
              }}
            >
              Load the example mission
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Eraser className="h-3.5 w-3.5" />}
              onClick={() => {
                if (!window.confirm(`Delete this mission, its crew and all ${total} readings from this browser?`)) return
                workspaceStore.clear()
                onDone('Mission cleared.')
              }}
            >
              Clear my mission
            </Button>
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-muted">
            The example is two crew members and 150 days of synthetic data with shared space conditions. Your mission is stored only in this browser; “Reset demo” elsewhere in AURORA does not touch it. Environment subject name for imports: <span className="mono">{ENV_SUBJECT === '@environment' ? 'environment' : ENV_SUBJECT}</span>.
          </p>
        </Panel>
      </div>
    </div>
  )
}
