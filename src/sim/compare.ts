import { scoreSeries } from './assess'
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
  /** The astronaut in A (kept as the key for selection). */
  astronautId: string
  /** The astronaut in B they are paired with. */
  bId: string
  name: string
  nameB: string
  indicators: IndicatorDiff[]
  effects: EffectDiff[]
}

export type Matching = 'id' | 'name' | 'position'

export interface Comparison {
  comparable: boolean
  reason: string
  /** How astronauts in A were paired with astronauts in B. */
  matching: Matching
  days: number
  changes: InputChange[]
  astronauts: AstronautComparison[]
}

/**
 * Pair the astronauts of two runs: by id (scenario copies), else by name, else
 * by roster position, so two unrelated missions can still be compared.
 */
export function pairAstronauts(cfgA: MissionConfig, a: SimulationResult, cfgB: MissionConfig, b: SimulationResult): { pairs: [string, string][]; matching: Matching } {
  const idsB = new Set(b.astronauts.map((r) => r.astronautId))
  const byId = a.astronauts.filter((r) => idsB.has(r.astronautId)).map((r) => [r.astronautId, r.astronautId] as [string, string])
  if (byId.length) return { pairs: byId, matching: 'id' }
  const nameOf = (cfg: MissionConfig, id: string) => (cfg.crew.find((c) => c.id === id)?.name ?? '').trim().toLowerCase()
  const used = new Set<string>()
  const byName: [string, string][] = []
  for (const ra of a.astronauts) {
    const n = nameOf(cfgA, ra.astronautId)
    const rb = n ? b.astronauts.find((r) => !used.has(r.astronautId) && nameOf(cfgB, r.astronautId) === n) : undefined
    if (rb) {
      used.add(rb.astronautId)
      byName.push([ra.astronautId, rb.astronautId])
    }
  }
  if (byName.length) return { pairs: byName, matching: 'name' }
  const n = Math.min(a.astronauts.length, b.astronauts.length)
  return { pairs: Array.from({ length: n }, (_, i) => [a.astronauts[i].astronautId, b.astronauts[i].astronautId] as [string, string]), matching: 'position' }
}

export function compareRuns(cfgA: MissionConfig, a: SimulationResult, cfgB: MissionConfig, b: SimulationResult): Comparison {
  const changes = inputChanges(cfgA, cfgB)
  const days = Math.min(a.days, b.days)
  const { pairs, matching } = pairAstronauts(cfgA, a, cfgB, b)
  const durations = a.days !== b.days ? ` Durations differ: days 1–${days} are compared day by day, and mission outcomes are taken at each mission's own end.` : ''
  const reason =
    matching === 'position'
      ? `The two missions have different crews, so astronauts are paired by roster position (first with first, and so on). Each difference mixes who is flying with what changed.${durations}`
      : matching === 'name'
        ? `Astronauts are paired by name.${cfgA.seed !== cfgB.seed ? ' The seeds differ, so part of every difference is random variation.' : ''}${durations}`
        : cfgA.seed !== cfgB.seed
          ? `The two scenarios use different random seeds, so part of every difference is random variation rather than a changed input.${durations}`
          : a.days !== b.days
            ? durations.trim()
            : 'Same seed and same astronaut ids: random variation is identical, so differences come from changed inputs.'
  const astronauts: AstronautComparison[] = []
  for (const [idA, idB] of pairs) {
    const ra = a.astronauts.find((r) => r.astronautId === idA)
    const rb = b.astronauts.find((r) => r.astronautId === idB)
    if (!ra || !rb) continue
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
    const nameA = cfgA.crew.find((c) => c.id === idA)?.name ?? idA
    const nameB = cfgB.crew.find((c) => c.id === idB)?.name ?? idB
    astronauts.push({ astronautId: idA, bId: idB, name: nameA, nameB, indicators, effects })
  }
  return { comparable: astronauts.length > 0, reason: astronauts.length ? reason : 'One of the missions has no participating astronauts.', matching, days, changes, astronauts }
}

// ------------------------------------------------------------ mission outcomes

export interface MissionOutcome {
  label: string
  unit: string
  decimals: number
  a: number
  b: number
  worseWhen: 'higher' | 'lower'
  note: string
}

/** Crew-mean readiness for every day of a run. */
export function crewReadiness(cfg: MissionConfig, r: SimulationResult): number[] {
  const all = r.astronauts.map((x) => scoreSeries(cfg, r, x.astronautId))
  return Array.from({ length: r.days }, (_, i) => all.reduce((s, ser) => s + ser[i], 0) / Math.max(1, all.length))
}

interface OutcomeStats {
  readinessEnd: number
  readinessMin: number
  readinessMean: number
  cautionDays: number
  debt: number
  pvt: number
  fatigue: number
  strength: number
  bone: number
  dose: number
}

function outcomeStats(cfg: MissionConfig, r: SimulationResult): OutcomeStats {
  const series = r.astronauts.map((x) => scoreSeries(cfg, r, x.astronautId))
  const end = r.days - 1
  const n = Math.max(1, r.astronauts.length)
  const avg = (f: (x: SimulationResult['astronauts'][number], k: number) => number) => r.astronauts.reduce((s, x, k) => s + f(x, k), 0) / n
  const last7 = (arr: Float32Array) => {
    let s = 0
    const from = Math.max(0, end - 6)
    for (let i = from; i <= end; i++) s += arr[i]
    return s / (end - from + 1)
  }
  return {
    readinessEnd: avg((_, k) => series[k][end]),
    readinessMin: series.length ? Math.min(...series.map((s) => s[end])) : 0,
    readinessMean: avg((_, k) => series[k].reduce((p, v) => p + v, 0) / series[k].length),
    cautionDays: avg((_, k) => series[k].filter((v) => v < 65).length),
    debt: avg((x) => x.daily.sleepDebt[end]),
    pvt: avg((x) => last7(x.daily.pvtLapses)),
    fatigue: avg((x) => x.daily.fatigue.reduce((p, v) => p + v, 0) / r.days),
    strength: avg((x) => last7(x.daily.muscleStrength)),
    bone: avg((x) => last7(x.daily.boneDensity)),
    dose: avg((x) => x.daily.radiationDose.reduce((p, v) => p + v, 0)),
  }
}

/** Whole-mission outcomes for each run, each taken at that mission's own end. */
export function missionOutcomes(cfgA: MissionConfig, a: SimulationResult, cfgB: MissionConfig, b: SimulationResult): MissionOutcome[] {
  const A = outcomeStats(cfgA, a)
  const B = outcomeStats(cfgB, b)
  const row = (label: string, key: keyof OutcomeStats, unit: string, decimals: number, worseWhen: 'higher' | 'lower', note: string): MissionOutcome => ({ label, unit, decimals, a: A[key], b: B[key], worseWhen, note })
  return [
    row('Readiness at mission end (crew mean)', 'readinessEnd', '/100', 0, 'lower', 'Same readiness model as the Medical Monitor.'),
    row('Lowest individual readiness at end', 'readinessMin', '/100', 0, 'lower', 'The crew member most at risk.'),
    row('Mean readiness over the mission', 'readinessMean', '/100', 0, 'lower', 'Every day, crew mean.'),
    row('Days in caution (< 65) per astronaut', 'cautionDays', 'days', 0, 'higher', 'Days an astronaut would need attention.'),
    row('Sleep debt at end', 'debt', 'h', 0, 'higher', '30 h ≈ one night without sleep (Van Dongen 2003).'),
    row('Reaction-test lapses, last week', 'pvt', '/test', 1, 'higher', 'Well rested ≈ 2.'),
    row('Mean fatigue over the mission', 'fatigue', '/10', 1, 'higher', ''),
    row('Strength at end', 'strength', '% pre-flight', 1, 'lower', ''),
    row('Bone indicator at end', 'bone', '% pre-flight', 2, 'lower', 'Bone lost in flight recovers slowly.'),
    row('Radiation dose over the mission', 'dose', 'mSv', 0, 'higher', 'Career limit 600 mSv (NASA-STD-3001).'),
  ]
}
