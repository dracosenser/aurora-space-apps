import { describe, expect, it } from 'vitest'
import { assess, scoreSeries, testRecommendation } from '../assess'
import { simulate } from '../engine'
import { blankMission, newAstronaut } from '../library'
import type { MissionConfig } from '../types'

function crewOf(sleepA: number, sleepB: number): MissionConfig {
  const m = blankMission()
  m.seed = 7
  m.durationDays = 90
  m.events = []
  const a = newAstronaut(0, { id: 'SHORT', name: 'Short Sleeper' })
  const b = newAstronaut(1, { id: 'LONG', name: 'Long Sleeper' })
  a.baseline = { ...a.baseline, sleepNeed: sleepA }
  b.baseline = { ...b.baseline, sleepNeed: sleepB }
  b.schedule = { ...b.schedule, sleepHours: 10 }
  m.crew = [a, b]
  return m
}

describe('readiness is driven by the data', () => {
  const m = crewOf(3, 9)
  const r = simulate(m)
  const short = assess(m, r, 'SHORT', 60)!
  const long = assess(m, r, 'LONG', 60)!

  it('a 3 h sleeper scores far below a 9 h sleeper', () => {
    expect(short.score).toBeLessThan(long.score - 25)
    expect(short.status).toBe('caution')
    expect(long.status).toBe('nominal')
  })

  it('sleep debt follows Van Dongen 2003: chronic 3 h sleep ≈ 2+ nights without sleep', () => {
    const run = r.astronauts.find((x) => x.astronautId === 'SHORT')!
    expect(run.daily.sleepDebt[59]).toBeGreaterThan(55)
    expect(run.daily.pvtLapses[59]).toBeGreaterThan(12)
    const rested = r.astronauts.find((x) => x.astronautId === 'LONG')!
    expect(rested.daily.pvtLapses[59]).toBeLessThan(4)
  })

  it('names sleep debt as the top weakness, explains its cause and recommends a fix', () => {
    const top = short.findings[0]
    expect(top.id).toBe('sleep-debt')
    expect(top.severity).toBe('major')
    expect(top.causes[0].effectId).toBe('habitual-sleep')
    expect(top.recommendation?.key).toBe('sleep-habit')
    const test = testRecommendation(m, r, 'SHORT', 60, top.recommendation!)!
    expect(test.after).toBeGreaterThan(test.before + 25)
  })

  it('the score changes smoothly from day to day', () => {
    const s = scoreSeries(m, r, 'LONG')
    let maxJump = 0
    for (let i = 10; i < s.length; i++) maxJump = Math.max(maxJump, Math.abs(s[i] - s[i - 1]))
    expect(maxJump).toBeLessThanOrEqual(4)
  })

  it('a short sleep period is blamed on the schedule and fixed by extending it', () => {
    const c = crewOf(8, 8)
    c.crew[0].schedule = { ...c.crew[0].schedule, sleepHours: 6 }
    const res = simulate(c)
    const a = assess(c, res, 'SHORT', 40)!
    const f = a.findings.find((x) => x.id === 'sleep-debt')!
    expect(f.causes[0].effectId).toBe('sleep-opportunity')
    expect(f.recommendation?.key).toBe('sleep-period')
    const t = testRecommendation(c, res, 'SHORT', 40, f.recommendation!)!
    expect(t.from).toBe('tomorrow')
    expect(t.after).toBeGreaterThan(t.before)
  })

  it('missing exercise in microgravity shows up as muscle and bone weakness with an exercise plan', () => {
    const c = crewOf(8, 8)
    c.environment = { ...c.environment, gravityG: 0 }
    c.crew[0].schedule = { ...c.crew[0].schedule, exerciseSessionsPerWeek: 0 }
    const res = simulate(c)
    const a = assess(c, res, 'SHORT', 80)!
    const musculo = a.domains.find((d) => d.id === 'musculo')!
    expect(musculo.score).toBeLessThan(70)
    expect(musculo.findings.some((f) => f.recommendation?.key === 'exercise')).toBe(true)
  })
})
