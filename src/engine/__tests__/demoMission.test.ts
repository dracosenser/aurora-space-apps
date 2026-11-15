import { describe, expect, it } from 'vitest'
import { createMissionAnalysis } from '../analysis'
import { generateVeilMission, VEIL_ACTION_DAY, VEIL_ENGINE_CONFIG, VEIL_TOTAL_DAYS } from '../../data/veilMission'
import { datasetFromDailyRecords } from '../../data/engineAdapters'
import { generateMissionRecords } from '../../data/generator'
import { ASTRONAUTS } from '../../data/astronauts'
import { EVENTS } from '../../data/mission'

const ds = generateVeilMission()
const an = createMissionAnalysis(ds, VEIL_ENGINE_CONFIG)

describe('SIGNAL VEIL demonstration mission through the engine', () => {
  it('is deterministic and labelled synthetic', () => {
    expect(JSON.stringify(generateVeilMission())).toBe(JSON.stringify(ds))
    expect(ds.totalDays).toBe(VEIL_TOTAL_DAYS)
    expect(ds.provenance).toBe('synthetic-demo')
    expect(ds.indicators.every((i) => i.provenance === 'synthetic-demo')).toBe(true)
    expect(ds.indicators.every((i) => ds.series[i.id].length === VEIL_TOTAL_DAYS)).toBe(true)
  })

  it('contains realistic gaps and one rejected sensor glitch', () => {
    expect(ds.series.reactionTime.filter((v) => v === null).length).toBeGreaterThan(8)
    expect(ds.series.restingHR.slice(109, 114).every((v) => v === null)).toBe(true)
    expect(an.timelineOf('restingHR').rejectedDays).toEqual([67])
    expect(an.stateAt('restingHR', 113).status).toBe('stale')
    expect(an.stateAt('muscleStrength', 12).status).toBe('insufficient-data')
  })

  it('is quiet during the baseline and early ramp', () => {
    for (const day of [45, 55, 65, 75]) {
      expect(an.patternsAt(day)).toEqual([])
      expect(an.summaryAt(day).counts.sustained).toBe(0)
    }
  })

  it('reports one joint pattern during the overlap phase, before any single indicator is sustained', () => {
    expect(an.patternEpisodes.length).toBe(1)
    const ep = an.patternEpisodes[0]
    expect(ep.detectedDay).toBeGreaterThanOrEqual(76)
    expect(ep.detectedDay).toBeLessThanOrEqual(100)
    const atDetection = an.patternsAt(ep.detectedDay)[0]
    expect(atDetection.stage).toBe('emerging')
    expect(atDetection.coreMemberIds.length).toBeGreaterThanOrEqual(4)
    expect(atDetection.categories.length).toBeGreaterThanOrEqual(3)
    expect(atDetection.membersBelowOwnLimitAtDetection).toBe(atDetection.coreMemberIds.length)
    expect(an.summaryAt(ep.detectedDay).counts.sustained).toBe(0)
  })

  it('describes the pattern as sustained during the investigation phase with the expected members', () => {
    const view = an.patternsAt(115)[0]
    expect(view.stage).toBe('sustained')
    expect(view.strength).toBe('strong')
    for (const id of ['sleepDuration', 'reactionTime', 'restingHR', 'fatigue']) expect(view.coreMemberIds).toContain(id)
    expect(view.coreMemberIds).not.toContain('exerciseMinutes')
    // Each change is modest in its own units.
    const pct = (id: string) => an.stateAt(id, 115).percentChange!
    expect(pct('sleepDuration')).toBeLessThan(-4)
    expect(pct('sleepDuration')).toBeGreaterThan(-15)
    expect(pct('restingHR')).toBeGreaterThan(2)
    expect(pct('restingHR')).toBeLessThan(12)
    expect(pct('reactionTime')).toBeGreaterThan(4)
    expect(pct('reactionTime')).toBeLessThan(18)
  })

  it('shows the pattern resolving after the recorded action', () => {
    const view = an.patternsAt(VEIL_TOTAL_DAYS)[0]
    expect(view.stage).toBe('resolved')
    expect(view.lastDay).toBeGreaterThan(VEIL_ACTION_DAY)
    expect(view.lastDay).toBeLessThan(140)
  })

  it('supports the planted day-to-day relationships and none involving the unrelated exercise log', () => {
    const rel = an.relationshipsAt(VEIL_TOTAL_DAYS)
    const get = (a: string, b: string) => an.relationshipBetween(a, b, VEIL_TOTAL_DAYS)!
    const sleepFatigue = get('sleepDuration', 'fatigue')
    expect(sleepFatigue.status).toBe('supported')
    expect(sleepFatigue.leader).toBe('sleepDuration')
    expect(sleepFatigue.lagDays).toBe(1)
    expect(sleepFatigue.rho).toBeLessThan(0)
    expect(get('sleepDuration', 'reactionTime').status).toBe('supported')
    expect(get('restingHR', 'hrv').status).toBe('supported')
    expect(get('restingHR', 'hrv').lagDays).toBe(0)
    expect(get('fatigue', 'mood').status).toBe('supported')
    expect(rel.filter((r) => r.status === 'supported' && (r.a === 'exerciseMinutes' || r.b === 'exerciseMinutes'))).toEqual([])
    expect(get('exerciseMinutes', 'reactionTime').status).toBe('not-established')
    expect(get('muscleStrength', 'fatigue').status).toBe('insufficient-data')
    // Resting heart rate and fatigue shifted during the same weeks but are not related day to day.
    const hrFatigue = get('restingHR', 'fatigue')
    expect(hrFatigue.status).toBe('not-established')
    expect(hrFatigue.overlapDays).toBeGreaterThan(5)
  })

  it('reveals relationships only as evidence accumulates', () => {
    expect(an.relationshipBetween('sleepDuration', 'fatigue', 25)!.status).toBe('insufficient-data')
    const supported = (day: number) => an.relationshipsAt(day).filter((r) => r.status === 'supported').length
    expect(supported(25)).toBeLessThanOrEqual(1)
    expect(supported(150)).toBeGreaterThanOrEqual(6)
  })

  it('evaluates the recorded sleep action and withholds judgement on the late exercise action', () => {
    const [sleepAction, exerciseAction] = ds.actions
    expect(an.responseFor(sleepAction, VEIL_ACTION_DAY + 4).status).toBe('awaiting-data')
    const done = an.responseFor(sleepAction, VEIL_TOTAL_DAYS)
    expect(done.status).toBe('evaluated')
    expect(done.indicators.find((i) => i.indicatorId === 'sleepDuration')!.classification).toBe('moved-toward-baseline')
    expect(done.indicators.find((i) => i.indicatorId === 'reactionTime')!.classification).toBe('no-clear-change')
    expect(done.confounders.some((c) => c.label.startsWith('Cargo vehicle departed'))).toBe(true)
    expect(an.responseFor(exerciseAction, VEIL_TOTAL_DAYS).status).toBe('awaiting-data')
  })

  it('produces complete, uniquely identified insights for every mission day', () => {
    for (const day of [10, 40, 88, 96, 115, 125, 150]) {
      const insights = an.insightsAt(day)
      expect(new Set(insights.map((i) => i.id)).size).toBe(insights.length)
      for (const i of insights) {
        expect(i.id).toMatch(/^CE-/)
        expect(i.narrative.length).toBeGreaterThan(20)
        expect(i.completeness.fraction).toBeGreaterThanOrEqual(0)
        expect(i.completeness.fraction).toBeLessThanOrEqual(1)
        expect(i.provenance).toBe('statistical-estimate')
        expect(i.evidence.statement.length).toBeGreaterThan(10)
      }
    }
    expect(an.insightsAt(96).some((i) => i.kind === 'multivariable-pattern')).toBe(true)
    expect(an.insightsAt(12).some((i) => i.kind === 'insufficient-evidence')).toBe(true)
    expect(an.insightsAt(150).some((i) => i.kind === 'response-evaluation')).toBe(true)
  })

  it('runs the whole pipeline quickly enough for interactive use', () => {
    const t0 = performance.now()
    const fresh = createMissionAnalysis(generateVeilMission(), VEIL_ENGINE_CONFIG)
    for (let d = 1; d <= VEIL_TOTAL_DAYS; d += 10) fresh.relationshipsAt(d)
    expect(performance.now() - t0).toBeLessThan(2500)
  })
})

describe('engine on the main application data', () => {
  it('adapts an Ares crew member and analyses them with a rolling baseline', () => {
    const records = generateMissionRecords(412)
    const ferreira = ASTRONAUTS.find((a) => a.id === 'AUR-04')!
    const dsAres = datasetFromDailyRecords(records, ferreira, EVENTS, 412)
    expect(dsAres.indicators.length).toBe(8)
    expect(dsAres.series.restingHR.filter((v) => v !== null).length).toBe(412)
    const ares = createMissionAnalysis(dsAres, { baseline: { mode: 'rolling' } })
    // The injected late-mission deconditioning scenario is found as a joint pattern that is still active.
    const last = ares.patternEpisodes[ares.patternEpisodes.length - 1]
    expect(last.endDay).toBeGreaterThanOrEqual(410)
    expect(last.startDay).toBeGreaterThan(390)
    expect(ares.patternsAt(412).find((p) => p.id === last.id)!.coreMemberIds).toContain('restingHR')
  })
})
