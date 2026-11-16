import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import type { RadiationScenario, ScenarioParams, ScenarioPoint } from '../types'
import { useMission } from '../hooks/useMission'
import { SCENARIO_PRESETS } from '../data/scenarios'
import { DEFAULT_PARAMS, MAX_SCENARIO_DAYS, RADIATION_SCENARIOS, SIMULATOR_ASSUMPTIONS, baselineFor, describeScenario, operationalConsiderations, phaseDays, runScenario } from '../lib/simulator'
import { fmtSigned } from '../lib/format'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Select, Slider } from '../components/ui/Controls'
import { Disclaimer } from '../components/ui/Misc'
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart'

type Metric = Exclude<keyof ScenarioPoint, 'day'>

const METRICS: { key: Metric; label: string; unit: string; decimals: number; color: string; worseWhen: 'higher' | 'lower' }[] = [
  { key: 'muscleStrength', label: 'Muscle strength index', unit: '% pre-flight', decimals: 1, color: '#4ade80', worseWhen: 'lower' },
  { key: 'boneDensity', label: 'Bone health indicator', unit: '% pre-flight', decimals: 1, color: '#a3e635', worseWhen: 'lower' },
  { key: 'sleepQuality', label: 'Sleep quality index', unit: '/100', decimals: 0, color: '#22d3ee', worseWhen: 'lower' },
  { key: 'restingHR', label: 'Resting heart rate', unit: 'bpm', decimals: 1, color: '#f87171', worseWhen: 'higher' },
  { key: 'fatigue', label: 'Fatigue indicator', unit: '/10', decimals: 1, color: '#e879f9', worseWhen: 'higher' },
  { key: 'sleepDebt', label: 'Sleep debt', unit: 'h', decimals: 0, color: '#818cf8', worseWhen: 'higher' },
  { key: 'radiationCumulative', label: 'Cumulative radiation dose', unit: 'mSv', decimals: 0, color: '#fbbf24', worseWhen: 'higher' },
  { key: 'readiness', label: 'Readiness (same model as Medical Monitor)', unit: '/100', decimals: 0, color: '#3b82f6', worseWhen: 'lower' },
]

export function Simulator() {
  const m = useMission()
  const [params, setParams] = useState<ScenarioParams>(m.lastScenario ?? SCENARIO_PRESETS[1].params)
  const [preset, setPreset] = useState<string | null>(m.lastScenario ? null : SCENARIO_PRESETS[1].id)

  const scenario = useMemo(() => runScenario(params), [params])
  const baseline = useMemo(() => baselineFor(params), [params])

  useEffect(() => {
    const t = window.setTimeout(() => m.setLastScenario(params), 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const update = (patch: Partial<ScenarioParams>) => {
    setPreset(null)
    setParams((p) => ({ ...p, ...patch }))
  }

  const merged = useMemo(() => {
    const byDay = new Map<number, Record<string, number>>()
    for (const p of baseline.series) byDay.set(p.day, { day: p.day, ...prefix(p, 'base_') })
    for (const p of scenario.series) byDay.set(p.day, { ...(byDay.get(p.day) ?? { day: p.day }), ...prefix(p, 'sim_') })
    return [...byDay.values()].sort((a, b) => a.day - b.day)
  }, [baseline, scenario])

  const isBaseline = JSON.stringify({ ...params, durationDays: 0 }) === JSON.stringify({ ...DEFAULT_PARAMS, durationDays: 0 })

  return (
    <div>
      <PageHeader
        eyebrow="Operations · 04"
        plate="PLATE 04"
        title="What-If Simulator"
        description="Explore hypothetical mission scenarios. Every parameter change re-runs the model instantly and compares projected indicator trends against the baseline mission plan. Illustrative models, not validated medical predictions."
        actions={
          <Button size="sm" variant="outline" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => { setParams(DEFAULT_PARAMS); setPreset('nominal') }}>
            Reset to baseline
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Controls */}
        <div className="space-y-4 xl:col-span-4">
          <Card title="Scenario presets" subtitle="Start from a prepared scenario, then adjust">
            <div className="grid gap-2">
              {SCENARIO_PRESETS.map((p) => (
                <button key={p.id} onClick={() => { setParams(p.params); setPreset(p.id) }} className={`rounded-md border px-3 py-2 text-left transition-colors ${preset === p.id ? 'border-accent/60 bg-accent/10' : 'border-border bg-surface-2 hover:border-border-strong'}`}>
                  <p className={`text-xs font-semibold ${preset === p.id ? 'text-accent' : 'text-text-strong'}`}>{p.name}</p>
                  <p className="text-[11px] text-muted">{p.tagline}</p>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Parameters" subtitle={preset ? SCENARIO_PRESETS.find((p) => p.id === preset)?.description : 'Custom scenario'}>
            <div className="space-y-5">
              <Slider label="Mission duration" value={Math.min(MAX_SCENARIO_DAYS, params.durationDays)} min={180} max={MAX_SCENARIO_DAYS} step={10} onChange={(v) => update({ durationDays: v })} format={(v) => `${v} days`} hint="Transit/surface split is held at 23% / 56% / 21% of the total." />
              <Slider label="Sleep disruption" value={params.sleepDisruption} min={0} max={100} step={5} onChange={(v) => update({ sleepDisruption: v })} format={(v) => `${v}%`} hint="0 = protected schedule, 100 = chronic shift work and noise." />
              <Slider label="Exercise frequency" value={params.exerciseSessionsPerWeek} min={0} max={7} step={1} onChange={(v) => update({ exerciseSessionsPerWeek: v })} format={(v) => `${v} / week`} hint="Nominal countermeasure schedule is 6 sessions per week." />
              <Select label="Radiation exposure scenario" value={params.radiationScenario} onChange={(v) => update({ radiationScenario: v as RadiationScenario })} options={(Object.keys(RADIATION_SCENARIOS) as RadiationScenario[]).map((k) => ({ value: k, label: RADIATION_SCENARIOS[k].label }))} />
              <p className="-mt-3 text-[11px] text-muted">{RADIATION_SCENARIOS[params.radiationScenario].blurb}</p>
              <Slider label="Mission stress level" value={params.stressLevel} min={1} max={10} step={1} onChange={(v) => update({ stressLevel: v })} format={(v) => `${v} / 10`} hint="Workload, isolation, communication delay and contingency burden." />
            </div>
          </Card>
        </div>

        {/* Results */}
        <div className="space-y-4 xl:col-span-8">
          <Card title="End-of-mission comparison" subtitle={`Scenario vs baseline plan at day ${params.durationDays}. Baseline = nominal parameters over the same duration.`}>
            {isBaseline && (
              <p className="mb-3 rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-text">
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" /> Parameters match the baseline plan, so deltas are zero. Pick a preset or move a slider to see the model respond.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {METRICS.map((mt) => {
                const s = scenario.final[mt.key]
                const b = baseline.final[mt.key]
                const d = s - b
                const worse = mt.worseWhen === 'higher' ? d > 0.0001 : d < -0.0001
                const better = mt.worseWhen === 'higher' ? d < -0.0001 : d > 0.0001
                return (
                  <div key={mt.key} className="rounded-md border border-border bg-surface-2 p-3">
                    <p className="truncate eyebrow-sm" title={mt.label}>{mt.label}</p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <p className="mono text-lg font-semibold text-text-strong">
                        {s.toFixed(mt.decimals)}
                        <span className="ml-1 text-[10px] font-normal text-muted">{mt.unit}</span>
                      </p>
                      <p className={`mono text-sm font-semibold ${worse ? 'text-danger' : better ? 'text-ok' : 'text-muted'}`}>{fmtSigned(d, mt.decimals)}</p>
                    </div>
                    <p className="mono mt-0.5 text-[10px] text-muted">baseline {b.toFixed(mt.decimals)}</p>
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {METRICS.map((mt) => (
              <Card key={mt.key} title={mt.label} subtitle={`${mt.unit} · solid = scenario, dashed = baseline`}>
                <TimeSeriesChart
                  data={merged}
                  series={[
                    { key: `base_${mt.key}`, label: 'Baseline', color: 'var(--muted)', dashed: true, width: 1.25 },
                    { key: `sim_${mt.key}`, label: 'Scenario', color: mt.color, width: 2 },
                  ]}
                  unit={mt.unit}
                  decimals={mt.decimals}
                  height={170}
                  showDate={false}
                  xLabel={(v) => `d${v}`}
                  markers={[
                    { day: phaseDays(scenario.params.durationDays).landing, label: 'land', color: 'var(--muted)' },
                    { day: phaseDays(scenario.params.durationDays).departure, label: 'depart', color: 'var(--muted)' },
                  ]}
                />
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Scenario explanation">
              <ul className="space-y-2 text-xs leading-relaxed text-text">
                {describeScenario(params).map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Potential operational considerations" subtitle="Generated from modelled thresholds; for discussion, not decision">
              <ul className="space-y-2 text-xs leading-relaxed text-text">
                {operationalConsiderations(scenario, baseline).map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="Assumptions and limitations">
            <ul className="grid gap-1.5 text-xs leading-relaxed text-text md:grid-cols-2">
              {SIMULATOR_ASSUMPTIONS.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                  {s}
                </li>
              ))}
            </ul>
          </Card>
          <Disclaimer tone="warn">
            <strong className="text-text-strong">Illustrative scenario model.</strong> These curves come from AURORA’s simulation engine, whose effect sizes are taken from published research where it exists and are marked as assumptions where it does not. They are not validated medical predictions, do not represent any real astronaut, and must not be used for real medical or operational decisions.
          </Disclaimer>
        </div>
      </div>
    </div>
  )
}

function prefix(p: ScenarioPoint, pre: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(p)) if (k !== 'day') out[pre + k] = v
  return out
}
