import { useState } from 'react'
import { Loader2, RefreshCw, Satellite } from 'lucide-react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'

interface Flare {
  flrID: string
  beginTime: string
  peakTime: string | null
  classType: string
  sourceLocation: string
}

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; flares: Flare[]; from: string; to: string }

/**
 * Optional live panel that reads REAL space-weather events from NASA's DONKI
 * API using the public DEMO_KEY (rate limited). It is fetched only on demand
 * and is clearly separated from the simulated mission data.
 */
export function SpaceWeather() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  const load = async () => {
    setState({ kind: 'loading' })
    const to = new Date()
    const from = new Date(to.getTime() - 30 * 86400000)
    const f = (d: Date) => d.toISOString().slice(0, 10)
    try {
      const res = await fetch(`https://api.nasa.gov/DONKI/FLR?startDate=${f(from)}&endDate=${f(to)}&api_key=DEMO_KEY`)
      if (res.status === 429) throw new Error('NASA DEMO_KEY rate limit reached. Try again later or add a free key from api.nasa.gov.')
      if (!res.ok) throw new Error(`NASA API responded ${res.status}`)
      const data = (await res.json()) as Flare[]
      setState({ kind: 'ok', flares: Array.isArray(data) ? data.slice(-8).reverse() : [], from: f(from), to: f(to) })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Network error' })
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Satellite className="h-3.5 w-3.5 text-accent" /> Live space weather
        </span>
      }
      subtitle="Real solar-flare events from NASA DONKI (api.nasa.gov). Not part of the simulated mission."
      action={
        <Button size="sm" variant="outline" onClick={load} disabled={state.kind === 'loading'} icon={state.kind === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}>
          {state.kind === 'idle' ? 'Fetch' : 'Refresh'}
        </Button>
      }
    >
      {state.kind === 'idle' && <p className="text-xs text-muted">Click Fetch to load solar flares observed in the last 30 days. Uses NASA's public DEMO_KEY, which is rate-limited; no key configuration is required.</p>}
      {state.kind === 'loading' && <p className="text-xs text-muted">Contacting api.nasa.gov…</p>}
      {state.kind === 'error' && (
        <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-text">
          <p className="font-medium text-danger">Could not load space weather</p>
          <p className="mt-0.5 text-muted">{state.message}</p>
        </div>
      )}
      {state.kind === 'ok' && (
        <div>
          <p className="mb-2 text-[11px] text-muted">
            {state.flares.length} most recent flare(s), {state.from} to {state.to}. <Badge tone="info">real data</Badge>
          </p>
          {state.flares.length === 0 ? (
            <p className="text-xs text-muted">No solar flares reported in this window.</p>
          ) : (
            <ul className="divide-y divide-border text-xs">
              {state.flares.map((fl) => (
                <li key={fl.flrID} className="flex items-center justify-between py-1.5">
                  <span className="mono text-text">{fl.beginTime.replace('T', ' ').replace('Z', ' UTC')}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted">{fl.sourceLocation || '—'}</span>
                    <Badge tone={fl.classType.startsWith('X') ? 'danger' : fl.classType.startsWith('M') ? 'warn' : 'neutral'}>{fl.classType}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
