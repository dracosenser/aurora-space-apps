import { describe, expect, it } from 'vitest'
import { createMissionAnalysis } from '../analysis'
import type { RecordedAction } from '../types'
import { dataset, indicator, noise } from './helpers'

const N = 160
const ACTION_DAY = 110

function action(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return { id: 'act', day: ACTION_DAY, label: 'Sleep protocol step', protocol: 'TEST-1', targetIndicators: ['sleep', 'fatigue'], provenance: 'user-entered', ...overrides }
}

function scenario() {
  // sleep: drops from day 60, returns after the action. fatigue: rises from day 60 and stays.
  // hr: unaffected throughout. mood: drops at the action (moves away from baseline).
  const sleep = noise(N, 3001, 7, 0.4, (d) => (d > 60 && d <= ACTION_DAY ? -0.8 : 0))
  const fatigue = noise(N, 3002, 3.5, 0.5, (d) => (d > 60 ? 1.1 : 0))
  const hr = noise(N, 3003, 58, 2)
  const mood = noise(N, 3004, 7, 0.5, (d) => (d > ACTION_DAY ? -1.3 : 0))
  return dataset(
    [indicator('sleep', 'sleep'), indicator('fatigue', 'behavioral'), indicator('hr', 'cardio'), indicator('mood', 'behavioral')],
    { sleep, fatigue, hr, mood },
    { events: [{ id: 'e1', day: 115, endDay: 118, title: 'Lighter timeline', description: 'Workload reduced.', kind: 'schedule' }] },
  )
}

describe('countermeasure response tracking', () => {
  it('waits for enough follow-up observations before comparing anything', () => {
    const an = createMissionAnalysis(scenario())
    const r = an.responseFor(action(), ACTION_DAY + 3)
    expect(r.status).toBe('awaiting-data')
    expect(r.postDaysElapsed).toBe(3)
    expect(r.indicators.every((i) => i.classification === 'insufficient-data')).toBe(true)
    expect(r.summary).toMatch(/at least 7 are needed/)
  })

  it('reports limited data while the follow-up window is still open', () => {
    const an = createMissionAnalysis(scenario())
    expect(an.responseFor(action(), ACTION_DAY + 9).status).toBe('limited-data')
    expect(an.responseFor(action(), ACTION_DAY + 14).status).toBe('evaluated')
  })

  it('classifies each indicator against the previous baseline', () => {
    const an = createMissionAnalysis(scenario())
    const r = an.responseFor(action(), ACTION_DAY + 14)
    const by = Object.fromEntries(r.indicators.map((i) => [i.indicatorId, i]))
    expect(by.sleep.classification).toBe('moved-toward-baseline')
    expect(by.sleep.distanceChange!).toBeGreaterThan(0.5)
    expect(by.sleep.zPre!).toBeLessThan(-1)
    expect(Math.abs(by.sleep.zPost!)).toBeLessThan(1)
    expect(by.fatigue.classification).toBe('no-clear-change')
    expect(by.hr.classification).toBe('near-baseline-before')
    expect(by.mood.classification).toBe('moved-away-from-baseline')
    expect(r.targetsEvaluated).toBe(2)
    expect(r.targetsTowardBaseline).toBe(1)
    expect(r.othersChanged).toEqual(['mood'])
  })

  it('reports completeness for both windows', () => {
    const ds = scenario()
    for (let d = ACTION_DAY + 1; d <= ACTION_DAY + 14; d += 2) ds.series.sleep[d - 1] = null
    const r = createMissionAnalysis(ds).responseFor(action(), ACTION_DAY + 14)
    const sleep = r.indicators.find((i) => i.indicatorId === 'sleep')!
    expect(sleep.nPre).toBe(14)
    expect(sleep.nPost).toBe(7)
    expect(r.confounders.some((c) => c.kind === 'data-gap')).toBe(true)
  })

  it('lists mission events and other actions inside the windows as context', () => {
    const an = createMissionAnalysis(scenario())
    const other = action({ id: 'other', day: ACTION_DAY + 4, label: 'Exercise block', targetIndicators: ['hr'] })
    const r = an.responseFor(action(), ACTION_DAY + 14, [action(), other])
    expect(r.confounders.some((c) => c.kind === 'event' && c.label === 'Lighter timeline')).toBe(true)
    expect(r.confounders.some((c) => c.kind === 'action' && c.label === 'Exercise block')).toBe(true)
  })

  it('flags a recovery that had already started before the recorded action', () => {
    // sleep recovers linearly from day 96, well before the action on day 110.
    const sleep = noise(N, 3101, 7, 0.25, (d) => (d > 60 && d <= 96 ? -1.2 : d > 96 && d <= 116 ? -1.2 + (1.2 * (d - 96)) / 20 : 0))
    const ds = dataset([indicator('sleep', 'sleep')], { sleep })
    const r = createMissionAnalysis(ds).responseFor(action({ targetIndicators: ['sleep'] }), ACTION_DAY + 14)
    expect(r.indicators[0].preTrendTowardBaseline).toBe(true)
    expect(r.confounders.some((c) => c.kind === 'pre-trend')).toBe(true)
  })

  it('never claims that the action caused a change', () => {
    const an = createMissionAnalysis(scenario())
    for (const day of [ACTION_DAY + 2, ACTION_DAY + 9, ACTION_DAY + 14, N]) {
      const r = an.responseFor(action(), day)
      const text = [r.summary, ...r.limitations].join(' ')
      expect(text).not.toMatch(/\b(caused|because of|due to|thanks to|resulted in|worked)\b(?! the change)/i)
      if (r.status !== 'awaiting-data') expect(r.summary).toMatch(/cannot determine whether the action caused the change/)
    }
    const r = an.responseFor(action(), N)
    expect(r.limitations.join(' ')).toMatch(/no control condition/)
    expect(r.limitations.join(' ')).toMatch(/does not recommend or prescribe/)
  })

  it('produces a response insight with windows, completeness and limitations', () => {
    const an = createMissionAnalysis(scenario())
    const insight = an.insightsAt(ACTION_DAY + 14, [action()]).find((i) => i.kind === 'response-evaluation')!
    expect(insight.id).toBe('CE-RSP-act')
    expect(insight.dateRange.startDay).toBe(ACTION_DAY - 14)
    expect(insight.completeness.fraction).toBeGreaterThan(0.9)
    expect(insight.limitations.length).toBeGreaterThanOrEqual(4)
  })
})
