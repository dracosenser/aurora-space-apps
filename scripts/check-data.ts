/**
 * Developer sanity check: generates the synthetic mission data, runs anomaly
 * detection and prints a summary. Run with: npx tsx scripts/check-data.ts
 */
import { generateMissionRecords } from '../src/data/generator'
import { ASTRONAUTS } from '../src/data/astronauts'
import { MISSION, EVENTS } from '../src/data/mission'
import { detectAnomalies } from '../src/lib/anomaly'
import { computeStatus } from '../src/lib/health'
import { runScenario, DEFAULT_PARAMS } from '../src/lib/simulator'
import { answerQuestion, SUGGESTED_QUESTIONS } from '../src/lib/assistant'

const records = generateMissionRecords(MISSION.currentDay)
console.log(`records: ${records.length} (${records.length / ASTRONAUTS.length} days x ${ASTRONAUTS.length} crew)`)
const last = records.filter((r) => r.day === MISSION.currentDay)
for (const r of last) console.log(r.astronautId, JSON.stringify(r))

const alerts = detectAnomalies(records, ASTRONAUTS, MISSION.currentDay)
console.log(`\nalerts: ${alerts.length}`)
for (const a of alerts) console.log(`${a.active ? 'ACTIVE  ' : 'resolved'} MD ${a.startDay}-${a.endDay} [${a.severity}] ${Math.round(a.confidence * 100)}% ${a.title}`)

const statuses = ASTRONAUTS.map((a) => computeStatus(a, records, alerts, MISSION.currentDay))
console.log('\nstatuses:')
for (const s of statuses) console.log(s.astronautId, s.score, s.status, s.drivers.join('; '))

const sim = runScenario(DEFAULT_PARAMS)
console.log('\nsim default final:', JSON.stringify(sim.final), 'points:', sim.series.length)
const bad = runScenario({ ...DEFAULT_PARAMS, exerciseSessionsPerWeek: 1, sleepDisruption: 70, stressLevel: 8, radiationScenario: 'spe-series' })
console.log('sim worst final:', JSON.stringify(bad.final))

const ctx = { records, astronauts: ASTRONAUTS, alerts, statuses, asOfDay: MISSION.currentDay, mission: MISSION, events: EVENTS, lastScenario: null }
for (const q of SUGGESTED_QUESTIONS) {
  const ans = answerQuestion(q, ctx)
  console.log(`\nQ: ${q}\n${ans.text.slice(0, 400)}`)
}
