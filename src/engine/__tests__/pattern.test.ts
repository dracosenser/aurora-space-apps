import { describe, expect, it } from 'vitest'
import { createMissionAnalysis } from '../analysis'
import { dataset, indicator, noise } from './helpers'

const N = 150
const IDS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']
const CATS = ['A', 'A', 'B', 'B', 'C', 'C']

function build(shape: (id: string, k: number) => (day: number) => number, seedBase = 500) {
  const defs = IDS.map((id, k) => indicator(id, CATS[k]))
  const series: Record<string, number[]> = {}
  IDS.forEach((id, k) => {
    series[id] = noise(N, seedBase + k, 100, 4, shape(id, k))
  })
  return createMissionAnalysis(dataset(defs, series))
}

describe('multivariable pattern detection', () => {
  it('finds no pattern in independent noise', () => {
    let episodes = 0
    for (let s = 0; s < 6; s++) episodes += build(() => () => 0, 600 + s * 10).patternEpisodes.length
    expect(episodes).toBeLessThanOrEqual(1)
  })

  it('detects overlapping modest shifts that are individually unremarkable', () => {
    // Four indicators in two categories move by about 1.15 SD from day 70.
    const an = build((_id, k) => (day) => (k < 4 && day > 70 ? (k % 2 === 0 ? 4.6 : -4.6) : 0))
    expect(an.patternEpisodes.length).toBeGreaterThanOrEqual(1)
    const ep = an.patternEpisodes[0]
    expect(ep.startDay).toBeGreaterThan(70)
    expect(ep.detectedDay).toBeLessThan(100)
    const view = an.patternsAt(ep.detectedDay + 20).find((p) => p.id === ep.id)!
    expect(view.coreMemberIds.length).toBeGreaterThanOrEqual(3)
    expect(view.categories.length).toBeGreaterThanOrEqual(2)
    for (const id of view.coreMemberIds) expect(['a1', 'a2', 'b1', 'b2']).toContain(id)
    // Most individual readings of the members are inside their ordinary range.
    const share = view.members.filter((m) => view.coreMemberIds.includes(m.indicatorId)).reduce((s, m) => s + m.ordinaryReadingShare, 0) / view.coreMemberIds.length
    expect(share).toBeGreaterThan(0.6)
    expect(view.t2Today!).toBeGreaterThan(view.limit!)
    expect(view.tailProbability!).toBeLessThan(0.001)
  })

  it('does not report a pattern when shifts do not overlap in time', () => {
    const windows: [number, number][] = [
      [50, 62],
      [70, 82],
      [90, 102],
      [110, 122],
    ]
    const an = build((_id, k) => (day) => (k < 4 && day >= windows[k][0] && day <= windows[k][1] ? 4.5 : 0))
    expect(an.patternEpisodes.length).toBe(0)
  })

  it('requires more than one category', () => {
    // Three indicators shift together but all belong to one category.
    const defs = ['x1', 'x2', 'x3', 'y1', 'y2', 'z1'].map((id) => indicator(id, id.startsWith('x') ? 'X' : id.startsWith('y') ? 'Y' : 'Z'))
    const series: Record<string, number[]> = {}
    defs.forEach((d, k) => {
      series[d.id] = noise(N, 700 + k, 100, 4, (day) => (d.category === 'X' && day > 70 ? 5 : 0))
    })
    const an = createMissionAnalysis(dataset(defs, series))
    expect(an.jointAt(110)!.exceeds).toBe(true)
    expect(an.patternEpisodes.length).toBe(0)
  })

  it('moves through emerging, sustained and resolved stages as the mission is replayed', () => {
    const an = build((_id, k) => (day) => (k < 5 && day > 60 && day <= 110 ? (k % 2 === 0 ? 5.6 : -5.6) : 0))
    const ep = [...an.patternEpisodes].sort((x, y) => y.patternDays.length - x.patternDays.length)[0]
    expect(an.patternsAt(ep.detectedDay - 1).find((p) => p.id === ep.id)).toBeUndefined()
    expect(an.patternsAt(ep.detectedDay).find((p) => p.id === ep.id)!.stage).toBe('emerging')
    expect(an.patternsAt(ep.startDay + 20).find((p) => p.id === ep.id)!.stage).toBe('sustained')
    const late = an.patternsAt(145).find((p) => p.id === ep.id)!
    expect(late.stage).toBe('resolved')
    expect(late.active).toBe(false)
    expect(ep.endDay).toBeLessThan(130)
  })

  it('grades evidence in words and never as a probability of illness', () => {
    const an = build((_id, k) => (day) => (k < 5 && day > 60 ? (k % 2 === 0 ? 5.6 : -5.6) : 0))
    const ep = an.patternEpisodes[0]
    expect(an.patternsAt(ep.detectedDay)[0].strength).not.toBe('strong')
    expect(an.patternsAt(140)[0].strength).toBe('strong')
    const insight = an.insightsAt(140).find((i) => i.kind === 'multivariable-pattern')!
    expect(insight.evidence.statement).toMatch(/not medical certainty/i)
    expect(insight.narrative).toMatch(/do not establish a medical condition/i)
    expect(insight.limitations.length).toBeGreaterThan(2)
    expect(insight.calculations.length).toBeGreaterThan(3)
  })

  it('excludes stale indicators from the joint statistic', () => {
    const defs = IDS.map((id, k) => indicator(id, CATS[k]))
    const series: Record<string, (number | null)[]> = {}
    IDS.forEach((id, k) => {
      series[id] = noise(N, 800 + k, 100, 4)
    })
    for (let d = 90; d <= 110; d++) series.a1[d - 1] = null
    const an = createMissionAnalysis(dataset(defs, series))
    expect(an.jointAt(100)!.variables).not.toContain('a1')
    expect(an.jointAt(100)!.variables.length).toBe(5)
    expect(an.jointAt(120)!.variables).toContain('a1')
  })
})
