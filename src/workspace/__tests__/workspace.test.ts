import { describe, expect, it } from 'vitest'
import { createMissionAnalysis } from '../../engine/analysis'
import { parseCsv, parseReadings, toCsv, csvTemplate } from '../csv'
import { datasetForCrew, engineConfigFor, radiationSummary, selfCheckRows, seriesFor, summariseSeries } from '../dataset'
import { buildExampleWorkspace } from '../example'
import {
  addAction,
  addCrew,
  addEvent,
  addIndicator,
  addPhase,
  countReadings,
  emptyWorkspace,
  parseWorkspace,
  removeCrew,
  removeIndicator,
  setIndicatorEnabled,
  setMission,
  setReading,
  setReadings,
  updateCrew,
} from '../ops'
import { ENV_SUBJECT } from '../types'

function withCrew() {
  let ws = emptyWorkspace()
  ws = addCrew(ws, { name: 'Ada Kim', role: 'Commander' })
  ws = addCrew(ws, { name: 'Ben Ortiz' })
  return ws
}

describe('mission and crew', () => {
  it('starts empty with the built-in catalogue', () => {
    const ws = emptyWorkspace()
    expect(ws.crew).toEqual([])
    expect(ws.indicators.some((i) => i.id === 'restingHR' && i.scope === 'crew')).toBe(true)
    expect(ws.indicators.some((i) => i.id === 'cabinCO2' && i.scope === 'environment')).toBe(true)
    expect(countReadings(ws)).toBe(0)
  })

  it('adds, renames and removes custom astronauts', () => {
    let ws = withCrew()
    expect(ws.crew.map((c) => c.id)).toEqual(['C-01', 'C-02'])
    expect(ws.crew[1].role).toBe('Crew member')
    expect(ws.crew[0].color).not.toBe(ws.crew[1].color)
    ws = updateCrew(ws, 'C-01', { name: 'Ada Kim-Ross' })
    expect(ws.crew[0].name).toBe('Ada Kim-Ross')
    expect(addCrew(ws, { name: '   ' })).toBe(ws)
    ws = setReading(ws, 'C-02', 'restingHR', 1, 60)
    ws = removeCrew(ws, 'C-02')
    expect(ws.crew.map((c) => c.id)).toEqual(['C-01'])
    expect(ws.readings['C-02']).toBeUndefined()
    // A new member never reuses a removed member's id while it is still free to pick the next number.
    expect(addCrew(ws, { name: 'Cy' }).crew[1].id).toBe('C-02')
  })

  it('keeps the mission days consistent', () => {
    let ws = setMission(emptyWorkspace(), { totalDays: 90, currentDay: 30 })
    expect(ws.mission).toMatchObject({ totalDays: 90, currentDay: 30 })
    ws = setMission(ws, { currentDay: 120 })
    expect(ws.mission.totalDays).toBe(120)
    ws = setMission(ws, { currentDay: -4, totalDays: 0 })
    expect(ws.mission.currentDay).toBe(1)
    expect(ws.mission.totalDays).toBe(1)
  })
})

describe('entering your own numbers', () => {
  it('stores, overwrites and clears a reading', () => {
    let ws = withCrew()
    ws = setReading(ws, 'C-01', 'restingHR', 3, 58)
    expect(ws.readings['C-01'].restingHR[3]).toBe(58)
    expect(ws.provenance['C-01'].restingHR).toBe('user-entered')
    ws = setReading(ws, 'C-01', 'restingHR', 3, 61)
    expect(ws.readings['C-01'].restingHR[3]).toBe(61)
    ws = setReading(ws, 'C-01', 'restingHR', 3, null)
    expect(ws.readings['C-01'].restingHR[3]).toBeUndefined()
    expect(countReadings(ws)).toBe(0)
  })

  it('advances the mission day when a later day is logged', () => {
    const ws = setReading(withCrew(), 'C-01', 'sleepDuration', 12, 6.5)
    expect(ws.mission.currentDay).toBe(12)
  })

  it('rejects readings that make no sense', () => {
    const ws = withCrew()
    expect(setReading(ws, 'nobody', 'restingHR', 1, 60)).toBe(ws)
    expect(setReading(ws, 'C-01', 'notAnIndicator', 1, 60)).toBe(ws)
    expect(setReading(ws, 'C-01', 'restingHR', 0, 60)).toBe(ws)
    expect(setReading(ws, 'C-01', 'restingHR', 1.5, 60)).toBe(ws)
    expect(setReading(ws, 'C-01', 'restingHR', 1, Number.NaN)).toBe(ws)
    // A space condition belongs to the environment, not to a person, and vice versa.
    expect(setReading(ws, 'C-01', 'cabinCO2', 1, 3)).toBe(ws)
    expect(setReading(ws, ENV_SUBJECT, 'restingHR', 1, 60)).toBe(ws)
  })

  it('never mutates the workspace it was given', () => {
    const ws = withCrew()
    const frozen = JSON.stringify(ws)
    setReadings(ws, [{ subject: 'C-01', indicatorId: 'mood', day: 1, value: 7 }])
    addEvent(ws, { day: 2, title: 'EVA', description: '', kind: 'operations' })
    expect(JSON.stringify(ws)).toBe(frozen)
  })

  it('lets you define your own indicator and remove it again', () => {
    let ws = addIndicator(withCrew(), { label: 'Grip strength', unit: 'kg', scope: 'crew', min: 0, max: 120, decimals: 1 })
    const custom = ws.indicators[ws.indicators.length - 1]
    expect(custom).toMatchObject({ id: 'gripStrength', unit: 'kg', builtin: false, enabled: true, category: 'custom' })
    ws = setReading(ws, 'C-01', 'gripStrength', 1, 44.5)
    ws = addIndicator(ws, { label: 'Grip strength', unit: 'kg', scope: 'crew' })
    expect(ws.indicators[ws.indicators.length - 1].id).toBe('gripStrength2')
    ws = removeIndicator(ws, 'gripStrength')
    expect(ws.indicators.some((i) => i.id === 'gripStrength')).toBe(false)
    expect(ws.readings['C-01'].gripStrength).toBeUndefined()
    // Built-in indicators can be hidden but not deleted.
    expect(removeIndicator(ws, 'restingHR')).toBe(ws)
    expect(setIndicatorEnabled(ws, 'restingHR', false).indicators.find((i) => i.id === 'restingHR')!.enabled).toBe(false)
  })

  it('lets you define your own space condition', () => {
    let ws = addIndicator(withCrew(), { label: 'Ammonia', unit: 'ppm', scope: 'environment' })
    const custom = ws.indicators[ws.indicators.length - 1]
    expect(custom).toMatchObject({ scope: 'environment', category: 'environment' })
    ws = setReading(ws, ENV_SUBJECT, custom.id, 4, 1.2)
    expect(ws.readings[ENV_SUBJECT][custom.id][4]).toBe(1.2)
  })
})

describe('CSV import and export', () => {
  it('parses quoted fields and other delimiters', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ])
    expect(parseCsv('day;value\r\n1;6,5\r\n')).toEqual([
      ['day', 'value'],
      ['1', '6,5'],
    ])
    expect(parseCsv('day\tvalue\n1\t2\n')[1]).toEqual(['1', '2'])
  })

  it('reads the wide layout, matching people and indicators by name', () => {
    const ws = withCrew()
    const text = 'Day,Subject,Resting HR,sleep duration,Cabin CO2,Unknown thing\n1,Ada Kim,58,6.9,2.6,5\n2,ben ortiz,61,,2.7,5\n'
    const r = parseReadings(text, ws)
    expect(r.format).toBe('wide')
    expect(r.unknownIndicators).toEqual(['Unknown thing'])
    expect(r.rows).toContainEqual({ subject: 'C-01', indicatorId: 'restingHR', day: 1, value: 58 })
    expect(r.rows).toContainEqual({ subject: 'C-02', indicatorId: 'restingHR', day: 2, value: 61 })
    // Space-condition columns go to the environment whatever the row's subject.
    expect(r.rows).toContainEqual({ subject: ENV_SUBJECT, indicatorId: 'cabinCO2', day: 2, value: 2.7 })
    expect(r.rows.filter((x) => x.indicatorId === 'sleepDuration')).toHaveLength(1)
    expect(r.errors).toEqual([])
  })

  it('reads the long layout and reports what it could not use', () => {
    const ws = withCrew()
    const text = ['day,subject,indicator,value', '1,C-01,restingHR,58', '1,environment,radiationDose,0.8', '2,Zed,restingHR,60', 'x,C-01,restingHR,60', '3,C-01,mood,high', '3,C-01,telepathy,4'].join('\n')
    const r = parseReadings(text, ws)
    expect(r.format).toBe('long')
    expect(r.rows).toHaveLength(2)
    expect(r.unknownSubjects).toEqual(['Zed'])
    expect(r.unknownIndicators).toEqual(['telepathy'])
    expect(r.errors.some((e) => e.includes('Row 5'))).toBe(true)
    expect(r.errors.some((e) => e.includes('"high" is not a number'))).toBe(true)
  })

  it('uses a default subject when the file has none, and counts implausible values', () => {
    const ws = withCrew()
    const r = parseReadings('day,restingHR,spo2\n1,58,97\n2,580,98\n', ws, 'C-02')
    expect(r.rows.every((x) => x.subject === 'C-02')).toBe(true)
    expect(r.implausible).toBe(1)
    expect(parseReadings('day,restingHR\n1,58\n', ws, null).errors[0]).toMatch(/needs a crew member/)
  })

  it('explains a file it cannot read at all', () => {
    const ws = withCrew()
    expect(parseReadings('', ws).errors[0]).toMatch(/header row/)
    expect(parseReadings('time,hr\n1,60\n', ws).errors[0]).toMatch(/No "day" column/)
  })

  it('round-trips through export and import', () => {
    let ws = withCrew()
    ws = setReadings(ws, [
      { subject: 'C-01', indicatorId: 'restingHR', day: 1, value: 58 },
      { subject: 'C-01', indicatorId: 'sleepDuration', day: 2, value: 6.4 },
      { subject: 'C-02', indicatorId: 'mood', day: 2, value: 7 },
      { subject: ENV_SUBJECT, indicatorId: 'cabinCO2', day: 1, value: 2.6 },
    ])
    const csv = toCsv(ws)
    expect(csv.split('\n')[0]).toBe('day,subject,indicator,value,unit,source')
    let again = withCrew()
    const parsed = parseReadings(csv, again)
    expect(parsed.errors).toEqual([])
    again = setReadings(again, parsed.rows, 'imported')
    expect(again.readings).toEqual(ws.readings)
    expect(again.provenance['C-01'].restingHR).toBe('imported')
    expect(csvTemplate(ws).split('\n')[0]).toContain('day,subject,restingHR')
  })
})

describe('saving and loading', () => {
  it('survives a JSON round trip', () => {
    let ws = withCrew()
    ws = setReading(ws, 'C-01', 'restingHR', 5, 59)
    ws = addPhase(ws, { name: 'Transit', startDay: 1, endDay: 40, gravity: 0 })
    ws = addEvent(ws, { day: 3, title: 'EVA', description: 'six hours', kind: 'operations' })
    const loaded = parseWorkspace(JSON.parse(JSON.stringify(ws)))!
    expect(loaded.crew).toEqual(ws.crew)
    expect(loaded.readings).toEqual(ws.readings)
    expect(loaded.phases).toEqual(ws.phases)
    expect(loaded.mission).toEqual(ws.mission)
  })

  it('rejects things that are not a workspace and repairs damaged ones', () => {
    expect(parseWorkspace(null)).toBeNull()
    expect(parseWorkspace({ version: 2 })).toBeNull()
    expect(parseWorkspace('hello')).toBeNull()
    const damaged = { version: 1, mission: { name: 'X', totalDays: 30, currentDay: 10, destination: '' }, crew: [{ id: 'C-01', name: 'A' }], indicators: [], readings: { 'C-01': { restingHR: { 1: 60, bad: 'x', 2: null }, gone: { 1: 1 } }, ghost: { restingHR: { 1: 1 } } } }
    const ws = parseWorkspace(damaged)!
    expect(ws.indicators.length).toBeGreaterThan(10)
    expect(ws.readings['C-01'].restingHR).toEqual({ 1: 60 })
    expect(ws.readings['C-01'].gone).toBeUndefined()
    expect(ws.readings.ghost).toBeUndefined()
  })
})

describe('space conditions', () => {
  it('sums logged radiation dose against the career limit', () => {
    let ws = setMission(withCrew(), { totalDays: 100, currentDay: 10 })
    for (let d = 1; d <= 10; d++) ws = setReading(ws, ENV_SUBJECT, 'radiationDose', d, d === 6 ? 5 : 1)
    const r = radiationSummary(ws)
    expect(r.loggedDays).toBe(10)
    expect(r.cumulative).toBeCloseTo(14, 10)
    expect(r.meanRate).toBeCloseTo(1.4, 10)
    expect(r.projected).toBeCloseTo(140, 10)
    expect(r.limit).toBe(600)
    expect(r.fractionOfLimit).toBeCloseTo(14 / 600, 10)
    expect(r.peakDay).toBe(6)
  })

  it('reports nothing rather than zero when no dose was logged', () => {
    const r = radiationSummary(withCrew())
    expect(r.loggedDays).toBe(0)
    expect(r.meanRate).toBeNull()
    expect(r.projected).toBeNull()
  })

  it('carries phases and events into the engine as context', () => {
    let ws = setMission(withCrew(), { currentDay: 50 })
    ws = setReading(ws, 'C-01', 'restingHR', 1, 60)
    ws = addPhase(ws, { name: 'Surface stay', startDay: 20, endDay: 90, gravity: 0.38 })
    ws = addEvent(ws, { day: 30, endDay: 32, title: 'Dust storm', description: 'EVA stand-down', kind: 'environment' })
    ws = addEvent(ws, { day: 70, title: 'Later', description: '', kind: 'other' })
    const ds = datasetForCrew(ws, 'C-01')!
    expect(ds.events.map((e) => e.title)).toEqual(['Phase: Surface stay', 'Dust storm'])
    expect(ds.events[0]).toMatchObject({ day: 20, endDay: 50 })
  })
})

describe('running the engine on your own data', () => {
  it('builds a dataset from only the series that have data', () => {
    let ws = withCrew()
    ws = setReadings(ws, [
      { subject: 'C-01', indicatorId: 'restingHR', day: 1, value: 58 },
      { subject: 'C-01', indicatorId: 'restingHR', day: 3, value: 60 },
      { subject: ENV_SUBJECT, indicatorId: 'cabinCO2', day: 2, value: 2.6 },
    ])
    const ds = datasetForCrew(ws, 'C-01')!
    expect(ds.indicators.map((i) => i.id)).toEqual(['restingHR', 'cabinCO2'])
    expect(ds.series.restingHR).toEqual([58, null, 60])
    expect(ds.indicators[0]).toMatchObject({ role: 'health', provenance: 'user-entered' })
    expect(ds.indicators[1]).toMatchObject({ role: 'context' })
    expect(ds.provenance).toBe('user-entered')
    expect(ds.subject.name).toBe('Ada Kim')
    expect(datasetForCrew(ws, 'nobody')).toBeNull()
    expect(seriesFor(ws, 'C-02', 'restingHR')).toEqual([null, null, null])
  })

  it('says there is not enough data rather than drawing a conclusion', () => {
    let ws = withCrew()
    for (let d = 1; d <= 6; d++) ws = setReading(ws, 'C-01', 'restingHR', d, 58 + (d % 3))
    const an = createMissionAnalysis(datasetForCrew(ws, 'C-01')!, engineConfigFor(ws))
    expect(an.stateAt('restingHR', 6).status).toBe('insufficient-data')
    expect(an.patternsAt(6)).toEqual([])
    expect(an.insightsAt(6).some((i) => i.kind === 'insufficient-evidence')).toBe(true)
  })

  it('chooses baseline settings to suit the length of the record', () => {
    const short = setMission(emptyWorkspace(), { totalDays: 400, currentDay: 30 })
    expect(engineConfigFor(short).baseline).toMatchObject({ mode: 'reference', referenceDays: 14 })
    expect(engineConfigFor(setMission(short, { currentDay: 150 })).baseline).toMatchObject({ mode: 'reference', referenceDays: 40 })
    expect(engineConfigFor(setMission(short, { currentDay: 300 })).baseline!.mode).toBe('rolling')
    expect(engineConfigFor({ ...short, baseline: 'rolling' }).baseline!.mode).toBe('rolling')
  })

  it('summarises a series and counts implausible entries', () => {
    let ws = withCrew()
    ws = setReadings(ws, [
      { subject: 'C-01', indicatorId: 'restingHR', day: 2, value: 60 },
      { subject: 'C-01', indicatorId: 'restingHR', day: 5, value: 64 },
      { subject: 'C-01', indicatorId: 'restingHR', day: 6, value: 900 },
    ])
    const ind = ws.indicators.find((i) => i.id === 'restingHR')!
    expect(summariseSeries(ws, 'C-01', ind)).toMatchObject({ count: 3, firstDay: 2, lastDay: 6, latest: 900, implausible: 1 })
    const an = createMissionAnalysis(datasetForCrew(ws, 'C-01')!)
    expect(an.timelineOf('restingHR').rejectedDays).toEqual([6])
  })
})

describe('Self-Assessment readings', () => {
  it('maps onto Workbench indicators, anchored to the current day', () => {
    const readings = [
      { id: 'systolic', value: 118, day: 410 },
      { id: 'heartRate', value: 61, day: 412 },
      { id: 'sleepHours', value: 6.5, day: 412 },
      { id: 'unknownCheck', value: 1, day: 412 },
      { id: 'mood', value: 7, day: 300 },
    ]
    const rows = selfCheckRows(readings, 'C-01', 20)
    expect(rows).toContainEqual({ subject: 'C-01', indicatorId: 'restingHR', day: 20, value: 61 })
    expect(rows).toContainEqual({ subject: 'C-01', indicatorId: 'sleepDuration', day: 20, value: 6.5 })
    expect(rows).toContainEqual({ subject: 'C-01', indicatorId: 'systolicBP', day: 18, value: 118 })
    // The reading from 112 days earlier would fall before day 1 and is skipped.
    expect(rows).toHaveLength(3)
    expect(selfCheckRows([], 'C-01', 20)).toEqual([])
  })
})

describe('the example mission', () => {
  const ws = buildExampleWorkspace()

  it('is complete, deterministic and labelled synthetic', () => {
    expect(JSON.stringify({ ...buildExampleWorkspace(), updatedAt: 0, phases: [], events: [] })).toBe(JSON.stringify({ ...ws, updatedAt: 0, phases: [], events: [] }))
    expect(ws.crew).toHaveLength(2)
    expect(ws.mission.currentDay).toBe(150)
    expect(countReadings(ws, ENV_SUBJECT)).toBe(600)
    expect(countReadings(ws, 'C-01')).toBeGreaterThan(1200)
    for (const s of Object.keys(ws.provenance)) for (const p of Object.values(ws.provenance[s])) expect(p).toBe('synthetic-demo')
    expect(datasetForCrew(ws, 'C-01')!.provenance).toBe('synthetic-demo')
  })

  it('lets the engine find the planted link between a space condition and a health signal', () => {
    const an = createMissionAnalysis(datasetForCrew(ws, 'C-01')!, engineConfigFor(ws))
    const link = an.relationshipBetween('sleepQuality', 'cabinCO2', 150)!
    expect(link.status).toBe('supported')
    expect(link.rho).toBeLessThan(0)
    expect(link.lagDays).toBe(0)
    // Conditions that were not linked to anything are not reported as related.
    expect(an.relationshipBetween('noise', 'restingHR', 150)!.status).toBe('not-established')
    expect(an.relationshipBetween('cabinTemp', 'fatigue', 150)!.status).toBe('not-established')
  })

  it('keeps space conditions out of joint health patterns', () => {
    const an = createMissionAnalysis(datasetForCrew(ws, 'C-01')!, engineConfigFor(ws))
    expect(an.jointModel.variableIds).not.toContain('cabinCO2')
    expect(an.jointModel.variableIds).not.toContain('radiationDose')
    expect(an.jointModel.variableIds).toContain('sleepDuration')
    expect(an.patternEpisodes.length).toBeGreaterThanOrEqual(1)
    for (const day of [100, 115]) for (const p of an.patternsAt(day)) expect(p.coreMemberIds).not.toContain('cabinCO2')
    // The condition still gets its own baseline and deviation.
    expect(an.stateAt('cabinCO2', 75).shift!).toBeGreaterThan(2)
  })

  it('tracks a recorded action for a custom crew member', () => {
    let mine = ws
    mine = addAction(mine, 'C-02', { id: 'u1', day: 121, label: 'Sleep protocol step', protocol: 'user', targetIndicators: ['sleepDuration'], provenance: 'user-entered' })
    const ds = datasetForCrew(mine, 'C-02')!
    expect(ds.actions.map((a) => a.id)).toEqual(['u1'])
    const an = createMissionAnalysis(ds, engineConfigFor(mine))
    expect(an.responseFor(ds.actions[0], 150).status).toBe('evaluated')
    expect(radiationSummary(mine).cumulative).toBeGreaterThan(100)
  })
})
