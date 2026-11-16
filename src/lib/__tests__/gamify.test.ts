import { describe, expect, it } from 'vitest'
import { EMPTY_LOG, batteryComplete, checkIn, readingsForDay, type CrewLog } from '../gamify'
import { CHECKS, type CheckId } from '../../data/selfcheck'

function logWith(entries: [string, CheckId, number][], day = 10): CrewLog {
  return { ...EMPTY_LOG, readings: entries.map(([astronautId, id, value], i) => ({ astronautId, id, value, day, at: i })) }
}

describe('self-assessment check-in', () => {
  it('keeps each crew member’s readings apart', () => {
    const log = logWith([
      ['A', 'heartRate', 60],
      ['B', 'heartRate', 110],
    ])
    expect(readingsForDay(log, 10, 'A').heartRate?.value).toBe(60)
    expect(readingsForDay(log, 10, 'B').heartRate?.value).toBe(110)
    expect(checkIn(log, 10, 'A').band).toBe('nominal')
    expect(checkIn(log, 10, 'B').band).toBe('caution')
  })

  it('scores readings against their bands, not how many were logged', () => {
    const one = checkIn(logWith([['A', 'heartRate', 60]]), 10, 'A')
    const all = checkIn(logWith(CHECKS.map((c) => ['A', c.id, (c.nominal[0] + c.nominal[1]) / 2] as [string, CheckId, number])), 10, 'A')
    expect(one.score).toBe(100)
    expect(all.score).toBe(100)
    expect(all.logged).toBe(CHECKS.length)
    expect(checkIn(EMPTY_LOG, 10, 'A').score).toBeNull()
  })

  it('a fever puts the check-in in caution', () => {
    const c = checkIn(logWith([['A', 'temperature', 39], ['A', 'heartRate', 60]]), 10, 'A')
    expect(c.band).toBe('caution')
    expect(c.score).toBe(70)
    expect(c.offBand[0].id).toBe('temperature')
  })

  it('a battery is complete per crew member', () => {
    const log = logWith(CHECKS.map((c) => ['A', c.id, c.seed] as [string, CheckId, number]))
    expect(batteryComplete(log, 10, 'A')).toBe(true)
    expect(batteryComplete(log, 10, 'B')).toBe(false)
  })
})
