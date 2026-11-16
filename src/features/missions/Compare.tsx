import { useMemo, useState } from 'react'
import { GitCompare } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Misc'
import { compareRuns } from '../../sim/compare'
import { missionLibrary, scenarioCopy, useMissionLibrary } from '../../sim/library'
import { SIM_INDICATORS, SIM_INDICATOR_BY_ID } from '../../sim/reference'
import { crewAlerts, runMission } from '../../sim/runtime'
import type { SimIndicator } from '../../sim/types'
import { Field, INPUT, Panel } from '../workbench/shared'
import { SimChart } from './SimChart'
import { eventBands, fmt } from './Results'

/** Run two scenarios with the same seed and crew and explain the differences. */
export function CompareView({ activeId, onEditB }: { activeId: string; onEditB: (id: string) => void }) {
  const lib = useMissionLibrary()
  // Opened from a scenario copy: compare its parent (A) with it (B). Otherwise A is the open mission.
  const open = lib.missions.find((m) => m.id === activeId)
  const parent = open?.scenarioOf && lib.missions.some((m) => m.id === open.scenarioOf) ? open.scenarioOf : null
  const [aId, setA] = useState(parent ?? activeId)
  const [bId, setB] = useState(parent ? activeId : (lib.missions.find((m) => m.scenarioOf === activeId)?.id ?? ''))
  const [who, setWho] = useState('')
  const [indicator, setIndicator] = useState<SimIndicator>('restingHR')
  const A = lib.missions.find((m) => m.id === aId)
  const B = lib.missions.find((m) => m.id === bId)
  const runA = useMemo(() => (A ? runMission(A) : null), [A])
  const runB = useMemo(() => (B ? runMission(B) : null), [B])
  const cmp = useMemo(() => (A && B && runA?.result && runB?.result ? compareRuns(A, runA.result, B, runB.result) : null), [A, B, runA, runB])

  const makeB = () => {
    const src = lib.missions.find((m) => m.id === aId)
    if (!src) return
    const copy = scenarioCopy(src)
    missionLibrary.add(copy, false)
    setB(copy.id)
    onEditB(copy.id)
  }

  const select = (label: string, value: string, set: (v: string) => void) => (
    <Field label={label} className="min-w-56 flex-1">
      <select className={INPUT} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Choose a mission</option>
        {lib.missions.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </Field>
  )

  const astro = cmp?.astronauts.find((x) => x.astronautId === who) ?? cmp?.astronauts[0]
  const ra = runA?.result?.astronauts.find((x) => x.astronautId === astro?.astronautId)
  const rb = runB?.result?.astronauts.find((x) => x.astronautId === astro?.astronautId)
  const firstAlert = (cfg: typeof A, r: typeof runA, id: string) => {
    if (!cfg || !r?.result) return null
    const days = crewAlerts(cfg, r.result).filter((x) => x.astronautId === id && x.level !== 'monitoring-alert').map((x) => x.startDay)
    return days.length ? Math.min(...days) : null
  }

  return (
    <div className="space-y-4">
      <Panel title="Scenarios" note="SAME SEED + SAME CREW = FAIR COMPARISON">
        <div className="flex flex-wrap items-end gap-3">
          {select('Scenario A', aId, setA)}
          {select('Scenario B', bId, setB)}
          <Button icon={<GitCompare className="h-3.5 w-3.5" />} onClick={makeB}>
            Make B from A
          </Button>
          {B && (
            <Button variant="ghost" onClick={() => onEditB(B.id)}>
              Edit B
            </Button>
          )}
        </div>
        <p className="mt-2 text-[10.5px] text-muted">“Make B from A” copies scenario A with the same seed, astronauts and events, and opens it for editing. Change what you want to test, then come back here.</p>
      </Panel>

      {(runA?.error || runB?.error) && <p className="border border-danger/40 px-3 py-2 text-xs text-danger">{runA?.error || runB?.error}</p>}

      {!cmp ? (
        <EmptyState icon={GitCompare} title="Choose two scenarios" body="Pick scenario A and B above, or make B from A." />
      ) : (
        <>
          <p className="border border-border px-3 py-2 text-xs text-text">{cmp.reason}</p>
          <div className="grid gap-4 xl:grid-cols-12">
            <Panel title="What changed in the inputs" note={`${cmp.changes.length} CHANGE${cmp.changes.length === 1 ? '' : 'S'}`} className="xl:col-span-5">
              {cmp.changes.length === 0 ? (
                <p className="text-xs text-muted">The scenarios have identical inputs, so their outputs are identical.</p>
              ) : (
                <ul className="divide-y divide-border text-xs">
                  {cmp.changes.map((c, i) => (
                    <li key={i} className="py-1.5">
                      <Badge>{c.area}</Badge> <span className="text-text-strong">{c.label}</span>
                      <p className="mono text-muted">
                        A: {c.a} → B: {c.b}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="How the changes propagate" note="BY MODELED EFFECT" className="xl:col-span-7">
              <div className="mb-2 flex flex-wrap gap-1">
                {cmp.astronauts.map((x) => (
                  <button key={x.astronautId} onClick={() => setWho(x.astronautId)} className={`border px-2 py-0.5 text-[11px] ${astro?.astronautId === x.astronautId ? 'border-text-strong text-text-strong' : 'border-border text-muted'}`}>
                    {x.name}
                  </button>
                ))}
              </div>
              {astro && astro.effects.length === 0 && <p className="text-xs text-muted">No modeled effect differs for {astro.name}.</p>}
              {astro && (
                <ul className="space-y-1.5 text-xs">
                  {astro.effects.slice(0, 10).map((e) => {
                    const d = SIM_INDICATOR_BY_ID[e.indicator]
                    return (
                      <li key={`${e.effectId}-${e.indicator}`} className="border-b border-border/60 pb-1.5">
                        <span className="text-text-strong">{e.label}</span> <Badge tone={e.basis === 'established' ? 'ok' : 'neutral'}>{e.basis === 'established' ? 'established' : 'simplified'}</Badge>
                        <p className="mono text-muted">
                          {d.shortLabel}: mean contribution {fmt(e.meanA, d.decimals + 1)} → {fmt(e.meanB, d.decimals + 1)} {d.unit}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          </div>
          {astro && ra && rb && A && B && (
            <>
              <Panel title={`${astro.name}: A vs B`}>
                <div className="mb-2 flex flex-wrap gap-1">
                  {SIM_INDICATORS.map((s) => (
                    <button key={s.id} onClick={() => setIndicator(s.id)} className={`border px-2 py-0.5 text-[10.5px] ${indicator === s.id ? 'border-text-strong text-text-strong' : 'border-border text-muted'}`}>
                      {s.shortLabel}
                    </button>
                  ))}
                </div>
                <SimChart
                  series={[
                    { key: 'a', label: `A: ${A.name}`, color: 'var(--muted)', values: ra.daily[indicator].subarray(0, cmp.days), dashed: true },
                    { key: 'b', label: `B: ${B.name}`, color: 'var(--accent)', values: rb.daily[indicator].subarray(0, cmp.days) },
                  ]}
                  bands={eventBands(B, astro.astronautId)}
                  decimals={SIM_INDICATOR_BY_ID[indicator].decimals}
                  height={210}
                />
              </Panel>
              <Panel title="Output differences" note={`DAYS 1–${cmp.days}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-[9px] uppercase tracking-[0.14em] text-faint">
                      <tr className="border-b border-border">
                        <th className="py-1.5 font-semibold">Indicator</th>
                        <th className="py-1.5 font-semibold">Mean A</th>
                        <th className="py-1.5 font-semibold">Mean B</th>
                        <th className="py-1.5 font-semibold">B − A</th>
                        <th className="py-1.5 font-semibold">Largest daily difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {astro.indicators.map((x) => {
                        const d = SIM_INDICATOR_BY_ID[x.indicator]
                        return (
                          <tr key={x.indicator} className="border-b border-border/60">
                            <td className="py-1 text-text">{d.label}</td>
                            <td className="mono py-1 text-muted">{fmt(x.meanA, d.decimals + 1)}</td>
                            <td className="mono py-1 text-muted">{fmt(x.meanB, d.decimals + 1)}</td>
                            <td className={`mono py-1 ${Math.abs(x.diff) >= d.resolution ? 'text-text-strong' : 'text-faint'}`}>{fmt(x.diff, d.decimals + 1)}</td>
                            <td className="mono py-1 text-muted">{Math.abs(x.peakDiff) >= d.resolution ? `${fmt(x.peakDiff, d.decimals + 1)} on day ${x.peakDay}` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted">
                  First trend or pattern alert for {astro.name}: A {firstAlert(A, runA, astro.astronautId) ?? 'none'}, B {firstAlert(B, runB, astro.astronautId) ?? 'none'}. A simulated difference is not evidence that a real change would have the same effect.
                </p>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  )
}
