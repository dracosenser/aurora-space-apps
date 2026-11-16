import { generateVeilMission, VEIL_ACTIONS, VEIL_EVENTS } from '../data/veilMission'
import { createRng } from '../lib/random'
import { addCrew, addEvent, addPhase, emptyWorkspace, setIndicatorEnabled, setMission, setReadings } from './ops'
import { ENV_SUBJECT, type ReadingRow, type Workspace } from './types'

/**
 * A filled-in example mission, so the Workbench can be explored before any
 * real numbers are entered. EVERY VALUE IS SYNTHETIC and is labelled so.
 *
 * Two crew members share 150 days of space conditions. One relationship
 * between a condition and a health signal is planted (cabin CO2 and sleep
 * quality on the same night) so there is something real for the engine to find.
 */
export function buildExampleWorkspace(): Workspace {
  let ws = emptyWorkspace()
  ws = setMission(ws, { name: 'Example: Selene-3', destination: 'Lunar orbit', totalDays: 180, currentDay: 150 })
  ws = addCrew(ws, { name: 'Noa Ilves', role: 'Flight Engineer' })
  ws = addCrew(ws, { name: 'Tomas Reyes', role: 'Mission Specialist' })
  for (const id of ['lapses', 'muscleStrength']) ws = setIndicatorEnabled(ws, id, true)
  ws = addPhase(ws, { name: 'Lunar orbit operations', startDay: 1, endDay: 180, gravity: 0 })

  // ---- Space conditions, shared by the crew.
  const rng = createRng(4107)
  const days = 150
  const co2: number[] = []
  const env: ReadingRow[] = []
  for (let day = 1; day <= days; day++) {
    // A scrubber maintenance period raises CO2 for nine days.
    const elevated = day >= 70 && day <= 78 ? 1.1 : 0
    const c = 2.6 + elevated + rng.normal(0, 0.34)
    co2.push(c)
    const flare = day === 62 ? 6.4 : day === 63 ? 2.1 : 0
    env.push({ subject: ENV_SUBJECT, indicatorId: 'cabinCO2', day, value: Math.round(Math.max(0.5, c) * 10) / 10 })
    env.push({ subject: ENV_SUBJECT, indicatorId: 'radiationDose', day, value: Math.round((0.82 * (1 + rng.normal(0, 0.08)) + flare) * 100) / 100 })
    env.push({ subject: ENV_SUBJECT, indicatorId: 'cabinTemp', day, value: Math.round((22.4 + rng.normal(0, 0.45)) * 10) / 10 })
    env.push({ subject: ENV_SUBJECT, indicatorId: 'noise', day, value: Math.round(58 + rng.normal(0, 1.6)) })
  }
  ws = setReadings(ws, env, 'synthetic-demo')

  // ---- Crew measurements, from the same generator as the SIGNAL VEIL demonstration.
  const seeds = [undefined, 20261710]
  ws.crew.forEach((member, k) => {
    const mission = generateVeilMission(seeds[k])
    const rows: ReadingRow[] = []
    for (const def of mission.indicators) {
      mission.series[def.id].forEach((value, i) => {
        if (value === null) return
        let v = value
        // The planted link: nights with higher cabin CO2 score lower on sleep quality.
        if (def.id === 'sleepQuality') v = Math.max(0, Math.min(100, Math.round(value - 11 * (co2[i] - 2.6))))
        rows.push({ subject: member.id, indicatorId: def.id, day: i + 1, value: v })
      })
    }
    ws = setReadings(ws, rows, 'synthetic-demo')
  })

  for (const e of VEIL_EVENTS) ws = addEvent(ws, { day: e.day, endDay: e.endDay, title: e.title, description: e.description, kind: e.kind })
  ws = addEvent(ws, { day: 62, endDay: 63, title: 'Solar particle event', description: 'Elevated dose for two days; crew sheltered.', kind: 'environment' })
  ws = addEvent(ws, { day: 70, endDay: 78, title: 'CO₂ scrubber maintenance', description: 'One scrubber bed offline; cabin CO₂ ran higher.', kind: 'systems' })
  ws = { ...ws, actions: { [ws.crew[0].id]: VEIL_ACTIONS.map((a) => ({ ...a })) } }
  return ws
}
