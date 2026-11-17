/**
 * Export the data the film shows, straight from AURORA's own modules.
 *
 * Nothing in the montage is typed in by hand: the crew, the mission, the daily
 * records, the indicator definitions and the anomalies all come out of the
 * application's source, so what a judge sees on screen is what the application
 * actually produces. The film cannot show a number the app would not.
 */
import { ASTRONAUTS } from '/tmp/vid/js/data/astronauts.js'
import { generateMissionRecords } from '/tmp/vid/js/data/generator.js'
import { INDICATORS } from '/tmp/vid/js/lib/indicators.js'
import { detectAnomalies } from '/tmp/vid/js/lib/anomaly.js'
import { MISSION, PHASES, phaseForDay, EVENTS } from '/tmp/vid/js/data/mission.js'
import { computeStatus } from '/tmp/vid/js/lib/health.js'
import { writeFileSync } from 'node:fs'

const records = generateMissionRecords()
const anomalies = detectAnomalies(records, ASTRONAUTS)

/**
 * The day the film is set on.
 *
 * Chosen because the application genuinely detects something here: a radiation
 * exposure event spanning days 405-406, crew-wide, across two indicators, with
 * its own explanatory text. The storyboard asked for "a developing pattern"
 * and this is the one AURORA actually finds — so the film shows that rather
 * than staging a deterioration the engine would not report. Asked for a status
 * on an untroubled crew member the app says "all tracked indicators within
 * personal baseline ranges", and a montage that implied otherwise would be
 * claiming a detection that never happened.
 */
const DAY = 407

const series = (astronautId, key, from, to) =>
  records
    .filter((r) => r.astronautId === astronautId && r.day >= from && r.day <= to)
    .map((r) => ({ d: r.day, v: r[key] }))

const upto = records.filter((r) => r.day <= DAY)

const crew = ASTRONAUTS.map((a) => {
  const status = computeStatus(a, upto, anomalies, DAY)
  const mine = records.filter((r) => r.astronautId === a.id)
  const today = mine.find((r) => r.day === DAY) ?? mine[mine.length - 1]
  const early = mine.slice(0, 30)
  const mean = (k) => early.reduce((t, r) => t + r[k], 0) / Math.max(1, early.length)
  return {
    id: a.id,
    name: a.name,
    role: a.role,
    initials: a.initials,
    callsign: a.callsign,
    // Straight from the application's own scoring, including the plain-English
    // drivers it writes for each crew member.
    score: status.score,
    status: status.status,
    drivers: (status.drivers ?? []).slice(0, 2),
    today,
    baseline: {
      restingHR: mean('restingHR'),
      hrv: mean('hrv'),
      systolicBP: mean('systolicBP'),
      sleepDuration: mean('sleepDuration'),
      sleepQuality: mean('sleepQuality'),
      stress: mean('stress'),
    },
  }
})

// The indicator metadata the interface labels everything with.
const indicatorMeta = {}
for (const k of ['restingHR', 'hrv', 'systolicBP', 'sleepDuration', 'sleepQuality', 'stress', 'fatigue', 'radiationDaily', 'exerciseMinutes', 'muscleStrength', 'boneDensity']) {
  const m = INDICATORS[k]
  if (m) indicatorMeta[k] = { label: m.label, short: m.shortLabel, unit: m.unit, decimals: m.decimals, category: m.category }
}

const subject = crew[0]
const out = {
  mission: { designation: MISSION.designation, destination: MISSION.destination, totalDays: MISSION.totalDays, day: DAY },
  phase: phaseForDay(DAY)?.name ?? '',
  phases: PHASES.map((p) => ({ name: p.name, start: p.startDay, end: p.endDay })),
  events: EVENTS.filter((e) => e.day <= DAY).slice(-4).map((e) => ({ day: e.day, title: e.title, type: e.type })),
  crew,
  indicatorMeta,
  anomalies: anomalies.map((a) => ({
    id: a.id, ruleName: a.ruleName, title: a.title, severity: a.severity,
    startDay: a.startDay, endDay: a.endDay, active: a.active,
    indicators: a.indicators, astronautIds: a.astronautIds,
    whatChanged: a.whatChanged, why: a.why,
  })),
  // The traces the film animates. Trimmed to the window the charts show.
  series: {
    restingHR: series(subject.id, 'restingHR', DAY - 59, DAY),
    hrv: series(subject.id, 'hrv', DAY - 59, DAY),
    sleepDuration: series(subject.id, 'sleepDuration', DAY - 59, DAY),
    stress: series(subject.id, 'stress', DAY - 59, DAY),
    radiationDaily: series(subject.id, 'radiationDaily', DAY - 59, DAY),
    systolicBP: series(subject.id, 'systolicBP', DAY - 59, DAY),
  },
  crewSeries: Object.fromEntries(
    ASTRONAUTS.map((a) => [a.id, series(a.id, 'restingHR', DAY - 41, DAY)]),
  ),
  // The crew-wide dose trace: the signal the detected event is actually made of.
  crewDose: Object.fromEntries(
    ASTRONAUTS.map((a) => [a.id, series(a.id, 'radiationDaily', DAY - 29, DAY)]),
  ),
}

writeFileSync('/tmp/vid/data.json', JSON.stringify(out))
console.log('mission     ', out.mission.designation, '· day', DAY, 'of', out.mission.totalDays, '·', out.phase)
console.log('crew        ', out.crew.map((c) => c.name).join(', '))
console.log('anomalies   ', out.anomalies.map((a) => `${a.ruleName} [${a.severity}]`).join(' | '))
for (const c of out.crew) console.log('  ', c.name.padEnd(16), 'score', String(c.score).padEnd(4), c.status.padEnd(8), (c.drivers[0] ?? '').slice(0, 52))
console.log('series pts  ', out.series.restingHR.length)
