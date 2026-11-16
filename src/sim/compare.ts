import { EFFECT_BY_ID, ENV_PARAMS, SIM_INDICATORS, SIM_INDICATOR_BY_ID } from './reference'
import { EVENT_TYPE_BY_ID } from './events'
import type { MissionConfig, SimIndicator, SimulationResult } from './types'

/**
 * Scenario comparison. Two runs that share a seed and astronaut ids have
 * identical random variation, so every difference in output traces back to a
 * difference in input, and the recorded effect contributions show which.
 */

export interface InputChange {
  area: 'mission' | 'environment' | 'crew' | 'event'
  label: string
  a: string
  b: string
}

function fmt(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (v === undefined || v === null || v === '') return '—'
  return String(v)
}

export function inputChanges(a: MissionConfig, b: MissionConfig): InputChange[] {
  const out: InputChange[] = []
  const cmp = (area: InputChange['area'], label: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ area, label, a: fmt(x), b: fmt(y) })
  }
  cmp('mission', 'Duration (days)', a.durationDays, b.durationDays)
  cmp('mission', 'Resolution', a.resolution, b.resolution)
  cmp('mission', 'Random seed', a.seed, b.seed)
  for (const p of ENV_PARAMS) cmp('environment', `${p.label} (${p.unit})`, a.environment[p.key], b.environment[p.key])
  const ids = new Set([...a.crew.map((c) => c.id), ...b.crew.map((c) => c.id)])
  for (const id of ids) {
    const x = a.crew.find((c) => c.id === id)
    const y = b.crew.find((c) => c.id === id)
    const name = (y ?? x)!.name
    if (!x || !y) {
      out.push({ area: 'crew', label: name, a: x ? 'on roster' : 'absent', b: y ? 'on roster' : 'absent' })
      continue
    }
    cmp('crew', `${name}: takes part`, x.participates, y.participates)
    for (const k of Object.keys(x.schedule) as (keyof typeof x.schedule)[]) cmp('crew', `${name}: ${k}`, x.schedule[k], y.schedule[k])
    for (const k of Object.keys(x.baseline) as (keyof typeof x.baseline)[]) cmp('crew', `${name}: baseline ${k}`, x.baseline[k], y.baseline[k])
  }
  const evIds = new Set([...a.events.map((e) => e.id), ...b.events.map((e) => e.id)])
  for (const id of evIds) {
    const x = a.events.find((e) => e.id === id)
    const y = b.events.find((e) => e.id === id)
    const title = (y ?? x)!.title
    if (!x || !y) out.push({ area: 'event', label: `${title} (${EVENT_TYPE_BY_ID[(y ?? x)!.type].label})`, a: x ? `day ${x.startDay}, ${x.durationDays} d` : 'not scheduled', b: y ? `day ${y.startDay}, ${y.durationDays} d` : 'not scheduled' })
    else {
      cmp('event', `${title}: timing`, `day ${x.startDay}, ${x.durationDays} d`, `day ${y.startDay}, ${y.durationDays} d`)
      cmp('event', `${title}: parameters`, x.params, y.params)
      cmp('event', `${title}: conditions`, x.envOverride ?? {}, y.envOverride ?? {})
      cmp('event', `${title}: who`, x.crewWide ? 'whole crew' : x.astronautIds, y.crewWide ? 'whole crew' : y.astronautIds)
    }
  }
  return out
}

export interface IndicatorDiff {
  indicator: SimIndicator
  meanA: number
  meanB: number
  diff: number
  /** Largest single-day difference. */
  peakDiff: number
  peakDay: number
}

export interface EffectDiff {
  effectId: string
  label: string
  basis: string
  indicator: SimIndicator
  /** Mean modeled contribution in A and in B over the compared days. */
  meanA: number
  meanB: number
}

export interface AstronautComparison {
  astronautId: string
  name: string
  indicators: IndicatorDiff[]
  effects: EffectDiff[]
}

export interface Comparison {
  comparable: boolean
  reason: string
  days: number
  changes: InputChange[]
  astronauts: AstronautComparison[]
}

export function compareRuns(cfgA: MissionConfig, a: SimulationResult, cfgB: MissionConfig, b: SimulationResult): Comparison {
  const changes = inputChanges(cfgA, cfgB)
  const days = Math.min(a.days, b.days)
  const reason =
    cfgA.seed !== cfgB.seed
      ? 'The two scenarios use different random seeds, so part of every difference is random variation rather than a changed input.'
      : a.days !== b.days
        ? `Durations differ; days 1–${days} are compared.`
        : 'Same seed and same astronaut ids: random variation is identical, so differences come from changed inputs.'
  const astronauts: AstronautComparison[] = []
  for (const ra of a.astronauts) {
    const rb = b.astronauts.find((r) => r.astronautId === ra.astronautId)
    if (!rb) continue
    const indicators: IndicatorDiff[] = SIM_INDICATORS.map((d) => {
      let sa = 0
      let sb = 0
      let peak = 0
      let peakDay = 1
      for (let i = 0; i < days; i++) {
        sa += ra.daily[d.id][i]
        sb += rb.daily[d.id][i]
        const diff = rb.daily[d.id][i] - ra.daily[d.id][i]
        if (Math.abs(diff) > Math.abs(peak)) {
          peak = diff
          peakDay = i + 1
        }
      }
      return { indicator: d.id, meanA: sa / days, meanB: sb / days, diff: (sb - sa) / days, peakDiff: peak, peakDay }
    })
    const keys = new Set([...ra.contributions, ...rb.contributions].map((c) => `${c.effectId}|${c.indicator}`))
    const effects: EffectDiff[] = []
    for (const key of keys) {
      const [effectId, indicator] = key.split('|') as [string, SimIndicator]
      const mean = (run: typeof ra) => {
        const c = run.contributions.find((x) => x.effectId === effectId && x.indicator === indicator)
        if (!c) return 0
        let s = 0
        for (let i = 0; i < days; i++) s += c.daily[i]
        return s / days
      }
      const meanA = mean(ra)
      const meanB = mean(rb)
      if (Math.abs(meanB - meanA) < SIM_INDICATOR_BY_ID[indicator].resolution / 2) continue
      effects.push({ effectId, label: EFFECT_BY_ID[effectId]?.label ?? effectId, basis: EFFECT_BY_ID[effectId]?.basis ?? 'simplified', indicator, meanA, meanB })
    }
    effects.sort((x, y) => Math.abs(y.meanB - y.meanA) / SIM_INDICATOR_BY_ID[y.indicator].resolution - Math.abs(x.meanB - x.meanA) / SIM_INDICATOR_BY_ID[x.indicator].resolution)
    const person = cfgB.crew.find((c) => c.id === ra.astronautId) ?? cfgA.crew.find((c) => c.id === ra.astronautId)
    astronauts.push({ astronautId: ra.astronautId, name: person?.name ?? ra.astronautId, indicators, effects })
  }
  return { comparable: astronauts.length > 0, reason: astronauts.length ? reason : 'The scenarios share no participating astronauts.', days, changes, astronauts }
}
