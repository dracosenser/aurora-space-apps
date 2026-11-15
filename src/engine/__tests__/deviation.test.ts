import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { computeIndicatorTimeline, findDeviationEpisodes } from '../timeline'
import { indicator, noise } from './helpers'

const cfg = DEFAULT_CONFIG

describe('deviation and trend detection', () => {
  it('rarely flags a stable series', () => {
    let flagged = 0
    let days = 0
    for (let seed = 100; seed < 110; seed++) {
      const tl = computeIndicatorTimeline(indicator('v'), noise(240, seed, 50, 3), 240, cfg)
      for (const s of tl.states.slice(40)) {
        days++
        if (s.status === 'sustained') flagged++
      }
    }
    expect(flagged / days).toBeLessThan(0.02)
  })

  it('detects a sustained shift that most single readings do not reveal', () => {
    // A step of 1.6 baseline standard deviations.
    const x = noise(140, 41, 50, 3, (d) => (d > 70 ? 4.8 : 0))
    const tl = computeIndicatorTimeline(indicator('v'), x, 140, cfg)
    const firstSustained = tl.states.find((s) => s.status === 'sustained')
    expect(firstSustained).toBeDefined()
    expect(firstSustained!.day).toBeGreaterThan(70)
    expect(firstSustained!.day).toBeLessThan(105)
    expect(firstSustained!.direction).toBe('above')
    // Most individual readings after the shift remain inside the ordinary ±2 SD range.
    const after = tl.states.slice(70).filter((s) => s.z !== null)
    const ordinary = after.filter((s) => Math.abs(s.z!) < 2).length / after.length
    expect(ordinary).toBeGreaterThan(0.5)
    const episodes = findDeviationEpisodes(tl, cfg).filter((e) => e.sustained)
    expect(episodes.length).toBeGreaterThanOrEqual(1)
    expect(episodes[0].direction).toBe('above')
  })

  it('treats a single extreme reading as unusual, not sustained', () => {
    const x = noise(100, 42, 50, 3)
    x[69] = 95
    const tl = computeIndicatorTimeline(indicator('v'), x, 100, cfg)
    expect(tl.states[69].status).toBe('unusual')
    expect(tl.states.slice(60, 85).some((s) => s.status === 'sustained')).toBe(false)
    expect(tl.states[80].status).toBe('normal')
  })

  it('does not call a two-day outage a sustained deviation', () => {
    const x = noise(120, 43, 90, 9)
    x[79] = 35
    x[80] = 38
    const tl = computeIndicatorTimeline(indicator('exercise'), x, 120, cfg)
    expect(tl.states[79].status).toBe('unusual')
    expect(tl.states.slice(75, 100).some((s) => s.status === 'sustained')).toBe(false)
  })

  it('reports a gradual trend before the control limit is persistently crossed', () => {
    const x = noise(130, 44, 50, 1, (d) => (d > 60 ? 0.12 * (d - 60) : 0))
    const tl = computeIndicatorTimeline(indicator('v'), x, 130, cfg)
    const firstDrift = tl.states.find((s) => s.status === 'drifting')
    const firstSustained = tl.states.find((s) => s.status === 'sustained')
    expect(firstDrift).toBeDefined()
    expect(firstSustained).toBeDefined()
    expect(firstDrift!.day).toBeLessThan(firstSustained!.day)
    expect(firstDrift!.trend!.slopePerDay).toBeGreaterThan(0)
    expect(firstDrift!.trend!.pValue).toBeLessThan(cfg.trend.alpha)
  })

  it('reports the direction and percentage of change against the personal baseline', () => {
    const x = noise(120, 45, 7, 0.4, (d) => (d > 60 ? -0.7 : 0))
    const tl = computeIndicatorTimeline(indicator('sleep'), x, 120, cfg)
    const s = tl.states[110]
    expect(s.direction).toBe('below')
    expect(s.percentChange!).toBeLessThan(-5)
    expect(s.percentChange!).toBeGreaterThan(-16)
  })

  it('is deterministic', () => {
    const x = noise(120, 46, 50, 3)
    const a = computeIndicatorTimeline(indicator('v'), x, 120, cfg)
    const b = computeIndicatorTimeline(indicator('v'), x, 120, cfg)
    expect(JSON.stringify(a.states)).toBe(JSON.stringify(b.states))
  })
})
