import type { Astronaut } from '../types'

/**
 * Fictional crew for the AURORA demonstration mission.
 * All people, names and baselines are invented for the demo.
 */
export const ASTRONAUTS: Astronaut[] = [
  {
    id: 'AUR-01',
    name: 'Maren Holt',
    callsign: 'Holt',
    role: 'Mission Commander',
    age: 44,
    background:
      'Former test pilot and two-time ISS expedition commander. Leads mission operations, EVA planning and crew scheduling.',
    color: '#8fa6bd',
    initials: 'MH',
    baseline: { restingHR: 56, hrv: 62, systolicBP: 118, diastolicBP: 76, sleepDuration: 6.6, exerciseMinutes: 95 },
  },
  {
    id: 'AUR-02',
    name: 'Kenji Arakawa',
    callsign: 'Arakawa',
    role: 'Flight Engineer / EVA Lead',
    age: 38,
    background:
      'Mechanical and life-support systems engineer. Responsible for habitat maintenance, exercise hardware and surface EVA operations.',
    color: '#c08a63',
    initials: 'KA',
    baseline: { restingHR: 60, hrv: 55, systolicBP: 121, diastolicBP: 78, sleepDuration: 6.4, exerciseMinutes: 100 },
  },
  {
    id: 'AUR-03',
    name: 'Amara Diallo',
    callsign: 'Diallo',
    role: 'Flight Surgeon / Medical Officer',
    age: 41,
    background:
      'Emergency physician and aerospace medicine specialist. Owns the crew medical program and reviews AURORA alerts.',
    color: '#8fa894',
    initials: 'AD',
    baseline: { restingHR: 58, hrv: 68, systolicBP: 114, diastolicBP: 72, sleepDuration: 6.9, exerciseMinutes: 90 },
  },
  {
    id: 'AUR-04',
    name: 'Luca Ferreira',
    callsign: 'Ferreira',
    role: 'Science Officer / Geologist',
    age: 35,
    background:
      'Planetary geologist leading the surface science campaign, sample curation and the long-traverse rover program.',
    color: '#a79bb0',
    initials: 'LF',
    baseline: { restingHR: 54, hrv: 74, systolicBP: 116, diastolicBP: 74, sleepDuration: 7.1, exerciseMinutes: 105 },
  },
]

export function getAstronaut(id: string): Astronaut | undefined {
  return ASTRONAUTS.find((a) => a.id === id)
}
