import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, runScenario } from '../simulator'
import { SCENARIO_PRESETS } from '../../data/scenarios'

describe('What-If simulator runs the real engine and readiness model', () => {
  const base = runScenario(DEFAULT_PARAMS)

  it('produces a full, finite series for the baseline plan', () => {
    expect(base.final.day).toBe(DEFAULT_PARAMS.durationDays)
    for (const p of base.series) for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true)
  })

  it('less exercise means more muscle and bone loss and lower readiness', () => {
    const low = runScenario({ ...DEFAULT_PARAMS, exerciseSessionsPerWeek: 1 })
    expect(low.final.muscleStrength).toBeLessThan(base.final.muscleStrength - 1)
    expect(low.final.boneDensity).toBeLessThan(base.final.boneDensity)
    expect(low.final.readiness).toBeLessThan(base.final.readiness)
  })

  it('chronic sleep disruption builds sleep debt and lowers readiness', () => {
    const bad = runScenario({ ...DEFAULT_PARAMS, sleepDisruption: 100 })
    expect(bad.final.sleepDebt).toBeGreaterThan(base.final.sleepDebt + 20)
    expect(bad.final.readiness).toBeLessThan(base.final.readiness - 15)
  })

  it('shielding lowers dose and solar minimum raises it', () => {
    expect(runScenario({ ...DEFAULT_PARAMS, radiationScenario: 'enhanced-shielding' }).final.radiationCumulative).toBeLessThan(base.final.radiationCumulative)
    expect(runScenario({ ...DEFAULT_PARAMS, radiationScenario: 'solar-minimum' }).final.radiationCumulative).toBeGreaterThan(base.final.radiationCumulative)
  })

  it('is deterministic and quick enough for a slider', () => {
    const t0 = performance.now()
    const a = runScenario({ ...DEFAULT_PARAMS, stressLevel: 8, durationDays: 1100 })
    const ms = performance.now() - t0
    const b = runScenario({ ...DEFAULT_PARAMS, stressLevel: 8, durationDays: 1100 })
    expect(b).toBe(a)
    expect(ms).toBeLessThan(1500)
    console.log(`1100-day scenario: ${ms.toFixed(0)} ms; presets end readiness: ${SCENARIO_PRESETS.map((p) => `${p.id} ${runScenario(p.params).final.readiness}`).join(', ')}; baseline ${base.final.readiness}, debt ${base.final.sleepDebt} h, dose ${base.final.radiationCumulative} mSv`)
  })
})
