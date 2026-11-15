import { describe, expect, it } from 'vitest'
import { createMissionAnalysis } from '../../../engine/analysis'
import { generateVeilMission, VEIL_ACTION_DAY, VEIL_ENGINE_CONFIG } from '../../../data/veilMission'
import { buildLayout, hitTestNode, linkKey } from '../model/layout'
import { buildSnapshot } from '../model/snapshot'
import { initialVeilState, veilReducer } from '../model/veilReducer'

const dataset = generateVeilMission()
const analysis = createMissionAnalysis(dataset, VEIL_ENGINE_CONFIG)
const order = dataset.indicators.map((i) => i.id)
const episode = analysis.patternEpisodes[0]

describe('constellation layout', () => {
  const layout = buildLayout(dataset.indicators, dataset.categories, 1.5)

  it('places one node per indicator inside the canvas, grouped by category', () => {
    expect(layout.nodes.map((n) => n.id).sort()).toEqual([...order].sort())
    expect(layout.anchors.length).toBe(5)
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThan(0.05)
      expect(n.x).toBeLessThan(0.95)
      expect(n.y).toBeGreaterThan(0.05)
      expect(n.y).toBeLessThan(0.95)
      expect(dataset.indicators.find((i) => i.id === n.id)!.category).toBe(n.categoryId)
    }
  })

  it('is deterministic and keeps nodes apart', () => {
    expect(buildLayout(dataset.indicators, dataset.categories, 1.5)).toEqual(layout)
    const w = 900
    const h = 600
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const d = Math.hypot((layout.nodes[i].x - layout.nodes[j].x) * w, (layout.nodes[i].y - layout.nodes[j].y) * h)
        expect(d).toBeGreaterThan(60)
      }
    }
  })

  it('stays inside the canvas on a tall, phone-shaped surface', () => {
    const tall = buildLayout(dataset.indicators, dataset.categories, 0.75)
    for (const n of tall.nodes) {
      expect(n.x).toBeGreaterThan(0.04)
      expect(n.x).toBeLessThan(0.96)
    }
  })

  it('hit-tests the nearest node within a radius', () => {
    const w = 900
    const h = 600
    const n = layout.nodes[3]
    expect(hitTestNode(layout, n.x * w + 6, n.y * h - 5, w, h, 24)?.id).toBe(n.id)
    expect(hitTestNode(layout, n.x * w + 40, n.y * h, w, h, 24)).toBeNull()
    expect(hitTestNode(layout, w / 2, h / 2, w, h, 24)).toBeNull()
  })

  it('builds canonical relationship ids', () => {
    expect(linkKey('fatigue', 'sleepDuration', order)).toBe('sleepDuration~fatigue')
    expect(linkKey('sleepDuration', 'fatigue', order)).toBe('sleepDuration~fatigue')
    expect(analysis.relationshipBetween('fatigue', 'sleepDuration', 150)!.id).toBe(linkKey('fatigue', 'sleepDuration', order))
  })
})

describe('node states come from the engine', () => {
  it('mirrors each indicator\'s analytical status for the selected day', () => {
    for (const day of [12, 60, 96, 113, 150]) {
      const snap = buildSnapshot(analysis, day, [])
      for (const id of order) expect(snap.nodes[id].status).toBe(analysis.stateAt(id, day).status)
    }
  })

  it('drives visual intensity from the smoothed deviation', () => {
    const snap = buildSnapshot(analysis, 115, [])
    for (const id of order) {
      const n = snap.nodes[id]
      expect(n.intensity).toBeGreaterThanOrEqual(0)
      expect(n.intensity).toBeLessThanOrEqual(1)
      if (n.shift !== null && n.status !== 'stale') expect(n.intensity).toBeCloseTo(Math.min(1, Math.abs(n.shift) / 5), 10)
    }
    // A strongly shifted signal is brighter than an unshifted one.
    expect(snap.nodes.sleepDuration.intensity).toBeGreaterThan(snap.nodes.exerciseMinutes.intensity)
    // Calm early in the mission.
    const early = buildSnapshot(analysis, 60, [])
    expect(Math.max(...order.map((id) => early.nodes[id].intensity))).toBeLessThan(0.6)
  })

  it('gives missing and insufficient data a distinct state with no glow', () => {
    const outage = buildSnapshot(analysis, 113, [])
    expect(outage.nodes.restingHR.status).toBe('stale')
    expect(outage.nodes.restingHR.intensity).toBe(0)
    expect(outage.nodes.restingHR.observedToday).toBe(false)
    expect(outage.nodes.restingHR.member).toBe(false)
    const early = buildSnapshot(analysis, 12, [])
    expect(early.nodes.muscleStrength.status).toBe('insufficient-data')
    expect(early.nodes.muscleStrength.intensity).toBe(0)
    expect(early.nodes.muscleStrength.baselineMedian).toBeNull()
  })

  it('marks the core members of a reported pattern', () => {
    const snap = buildSnapshot(analysis, 115, [])
    expect(snap.pattern).not.toBeNull()
    expect(snap.pattern!.active).toBe(true)
    expect(snap.pattern!.stage).toBe('sustained')
    for (const id of snap.pattern!.coreMemberIds) expect(snap.nodes[id].inPattern).toBe(true)
    expect(snap.nodes.exerciseMinutes.inPattern).toBe(false)
    expect(snap.joint!.exceeds).toBe(true)
    expect(snap.joint!.ratio).toBeGreaterThan(1)
  })
})

describe('timeline changes', () => {
  it('produces a different picture for different days', () => {
    const a = buildSnapshot(analysis, 50, [])
    const b = buildSnapshot(analysis, 115, [])
    expect(a.pattern).toBeNull()
    expect(a.joint!.exceeds).toBe(false)
    expect(b.pattern!.active).toBe(true)
    expect(a.nodes.sleepDuration.lastValue).not.toBe(b.nodes.sleepDuration.lastValue)
    expect(a.caption).not.toBe(b.caption)
  })

  it('shows the pattern only from the day the engine reported it', () => {
    expect(buildSnapshot(analysis, episode.detectedDay - 1, []).pattern).toBeNull()
    const at = buildSnapshot(analysis, episode.detectedDay, [])
    expect(at.pattern!.stage).toBe('emerging')
    expect(at.caption).toMatch(/joint pattern reported/i)
  })

  it('shows the pattern as resolved, with no members marked, late in the mission', () => {
    const late = buildSnapshot(analysis, 150, [])
    expect(late.pattern!.active).toBe(false)
    expect(order.some((id) => late.nodes[id].inPattern)).toBe(false)
  })

  it('reports events and recorded actions on their days', () => {
    expect(buildSnapshot(analysis, VEIL_ACTION_DAY, []).actions.map((a) => a.id)).toEqual(['act-sleep'])
    expect(buildSnapshot(analysis, VEIL_ACTION_DAY, []).caption).toMatch(/recorded action/i)
    expect(buildSnapshot(analysis, 112, []).events.map((e) => e.id)).toContain('v-sensor')
    expect(buildSnapshot(analysis, 30, []).events).toEqual([])
  })

  it('clamps out-of-range days', () => {
    expect(buildSnapshot(analysis, 0, []).day).toBe(1)
    expect(buildSnapshot(analysis, 999, []).day).toBe(150)
  })
})

describe('drawn connections reveal engine results', () => {
  const supportedId = linkKey('sleepDuration', 'fatigue', order)
  const unsupportedId = linkKey('exerciseMinutes', 'reactionTime', order)

  it('shows a supported relationship with its direction and lag', () => {
    const snap = buildSnapshot(analysis, 150, [supportedId])
    expect(snap.links).toHaveLength(1)
    expect(snap.links[0]).toMatchObject({ status: 'supported', leader: 'sleepDuration', follower: 'fatigue', lagDays: 1 })
    expect(snap.links[0].strength).toBeGreaterThan(0.5)
    expect(snap.supportedFound).toBe(1)
  })

  it('cannot be made to show a relationship the engine did not find', () => {
    const snap = buildSnapshot(analysis, 150, [unsupportedId])
    expect(snap.links[0].status).toBe('not-established')
    expect(snap.supportedFound).toBe(0)
    // Drawing every possible pair changes nothing about what is supported.
    const all: string[] = []
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) all.push(`${order[i]}~${order[j]}`)
    const everything = buildSnapshot(analysis, 150, all)
    expect(everything.links.filter((l) => l.status === 'supported').length).toBe(everything.supportedAvailable)
    expect(everything.supportedAvailable).toBe(analysis.relationshipsAt(150).filter((r) => r.status === 'supported').length)
  })

  it('lets a connection appear and disappear with the selected day', () => {
    expect(buildSnapshot(analysis, 20, [supportedId]).links[0].status).toBe('insufficient-data')
    expect(buildSnapshot(analysis, 150, [supportedId]).links[0].status).toBe('supported')
  })

  it('ignores ids that are not real pairs', () => {
    expect(buildSnapshot(analysis, 150, ['nope~nada']).links).toEqual([])
  })
})

describe('replay reflects the recorded data', () => {
  it('walks the reducer through the replay and sees the pattern develop', () => {
    let state = initialVeilState(dataset.totalDays, order, 150)
    state = veilReducer(state, { type: 'start-replay', plan: { fromDay: episode.startDay - 30, toDay: episode.detectedDay + 26, holdDay: episode.detectedDay, label: episode.id } })
    const stages: string[] = []
    const ratios: number[] = []
    while (state.playing) {
      const snap = buildSnapshot(analysis, state.day, state.revealedLinks)
      stages.push(snap.pattern ? snap.pattern.stage : 'none')
      ratios.push(snap.joint ? snap.joint.ratio : 0)
      state = veilReducer(state, { type: 'tick', days: 1 })
    }
    // Quiet at the start, then emerging, then sustained: in that order.
    expect(stages[0]).toBe('none')
    expect(stages).toContain('emerging')
    expect(stages[stages.length - 1]).toBe('sustained')
    expect(stages.indexOf('emerging')).toBeLessThan(stages.indexOf('sustained'))
    expect(stages.lastIndexOf('none')).toBeLessThan(stages.indexOf('emerging'))
    // The joint statistic is below its limit at the start and above it at the end.
    expect(ratios[0]).toBeLessThan(1)
    expect(ratios[ratios.length - 1]).toBeGreaterThan(1)
    expect(state.day).toBe(episode.detectedDay + 26)
  })
})
