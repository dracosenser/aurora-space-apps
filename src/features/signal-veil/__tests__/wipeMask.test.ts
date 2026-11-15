import { describe, expect, it } from 'vitest'
import { WipeMask } from '../model/wipeMask'

const ASPECT = 1.6

describe('fog wipe mask', () => {
  it('starts fully fogged', () => {
    const m = new WipeMask()
    expect(m.revealedFraction()).toBe(0)
    expect(m.valueAt(0.5, 0.5)).toBe(0)
  })

  it('clears the fog under the pointer and nowhere else', () => {
    const m = new WipeMask()
    m.stamp(0.5, 0.5, 0.1, ASPECT)
    expect(m.valueAt(0.5, 0.5)).toBe(1)
    expect(m.valueAt(0.1, 0.1)).toBe(0)
    expect(m.valueAt(0.9, 0.9)).toBe(0)
    expect(m.revealedFraction()).toBeGreaterThan(0)
    expect(m.revealedFraction()).toBeLessThan(0.05)
  })

  it('feathers the brush edge', () => {
    const m = new WipeMask(640, 400)
    m.stamp(0.5, 0.5, 0.2, ASPECT)
    const samples = [0, 0.05, 0.1, 0.13, 0.16, 0.19].map((dy) => m.valueAt(0.5, 0.5 + dy))
    expect(samples[0]).toBe(1)
    expect(samples[1]).toBe(1) // inside the solid core
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1])
    expect(samples[3]).toBeGreaterThan(0)
    expect(samples[3]).toBeLessThan(1) // partially cleared in the feather
    expect(m.valueAt(0.5, 0.5 + 0.21)).toBe(0) // untouched beyond the radius
  })

  it('keeps the brush circular on a wide surface', () => {
    const m = new WipeMask(640, 400)
    const r = 0.2
    m.stamp(0.5, 0.5, r, ASPECT)
    // The radius is a fraction of the height, so horizontally it spans r / aspect of the width.
    expect(m.valueAt(0.5 + (r * 0.9) / ASPECT, 0.5)).toBeGreaterThan(0)
    expect(m.valueAt(0.5 + (r * 1.1) / ASPECT, 0.5)).toBe(0)
    expect(m.valueAt(0.5, 0.5 + r * 0.9)).toBeGreaterThan(0)
    expect(m.valueAt(0.5, 0.5 + r * 1.1)).toBe(0)
  })

  it('follows the pointer trajectory without gaps', () => {
    const m = new WipeMask()
    m.stroke(0.1, 0.2, 0.9, 0.8, 0.05, ASPECT)
    for (let t = 0; t <= 1; t += 0.05) expect(m.valueAt(0.1 + 0.8 * t, 0.2 + 0.6 * t)).toBe(1)
    // A point well off the path is untouched.
    expect(m.valueAt(0.9, 0.2)).toBe(0)
    expect(m.valueAt(0.1, 0.8)).toBe(0)
  })

  it('combines overlapping strokes and never re-fogs', () => {
    const m = new WipeMask()
    m.stroke(0.2, 0.5, 0.8, 0.5, 0.08, ASPECT)
    const before = Array.from(m.data)
    const fractionBefore = m.revealedFraction()
    m.stroke(0.5, 0.2, 0.5, 0.8, 0.08, ASPECT)
    for (let i = 0; i < before.length; i++) expect(m.data[i]).toBeGreaterThanOrEqual(before[i])
    expect(m.revealedFraction()).toBeGreaterThan(fractionBefore)
    // Repeated passes over a feathered edge build up.
    const edge = m.valueAt(0.2, 0.5 + 0.065)
    m.stroke(0.2, 0.5, 0.8, 0.5, 0.08, ASPECT)
    expect(m.valueAt(0.2, 0.5 + 0.065)).toBeGreaterThanOrEqual(edge)
  })

  it('persists what has been cleared', () => {
    const m = new WipeMask()
    m.stamp(0.3, 0.3, 0.1, ASPECT)
    m.stamp(0.7, 0.7, 0.1, ASPECT)
    expect(m.valueAt(0.3, 0.3)).toBe(1)
    expect(m.valueAt(0.7, 0.7)).toBe(1)
  })

  it('clears more with a larger brush', () => {
    const small = new WipeMask()
    const large = new WipeMask()
    small.stamp(0.5, 0.5, 0.05, ASPECT)
    large.stamp(0.5, 0.5, 0.15, ASPECT)
    expect(large.revealedFraction()).toBeGreaterThan(small.revealedFraction() * 6)
  })

  it('tracks the revealed fraction exactly', () => {
    const m = new WipeMask(64, 40)
    m.stroke(0.1, 0.1, 0.9, 0.9, 0.2, ASPECT)
    m.stamp(0.2, 0.8, 0.15, ASPECT)
    let sum = 0
    for (const v of m.data) sum += v
    expect(m.revealedFraction()).toBeCloseTo(sum / (255 * m.data.length), 12)
  })

  it('resets to fully fogged and can be cleared entirely', () => {
    const m = new WipeMask()
    m.stroke(0.1, 0.5, 0.9, 0.5, 0.1, ASPECT)
    const v1 = m.version
    m.reset()
    expect(m.revealedFraction()).toBe(0)
    expect(m.valueAt(0.5, 0.5)).toBe(0)
    expect(m.version).toBeGreaterThan(v1)
    m.clearAll()
    expect(m.revealedFraction()).toBe(1)
    expect(m.valueAt(0.01, 0.99)).toBe(1)
  })

  it('bumps its version only when something changes', () => {
    const m = new WipeMask()
    const v0 = m.version
    m.stamp(0.5, 0.5, 0.1, ASPECT)
    const v1 = m.version
    expect(v1).toBeGreaterThan(v0)
    m.stamp(0.5, 0.5, 0.02, ASPECT) // already fully clear here
    expect(m.version).toBe(v1)
    m.stamp(5, 5, 0.1, ASPECT) // off the surface
    expect(m.version).toBe(v1)
  })
})
