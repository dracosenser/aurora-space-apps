import type { Mission, MissionEvent, MissionPhase } from '../types'

export const PHASES: MissionPhase[] = [
  {
    id: 'launch',
    name: 'Launch & Earth departure',
    startDay: 1,
    endDay: 7,
    gravity: 0,
    description: 'Ascent, rendezvous with the transit vehicle and trans-Mars injection.',
  },
  {
    id: 'outbound',
    name: 'Outbound transit',
    startDay: 8,
    endDay: 205,
    gravity: 0,
    description: 'Deep-space cruise in microgravity. Highest galactic cosmic ray exposure of the mission.',
  },
  {
    id: 'moi',
    name: 'Mars orbit insertion & landing',
    startDay: 206,
    endDay: 212,
    gravity: 0,
    description: 'Orbit insertion, descent vehicle checkout and entry, descent and landing.',
  },
  {
    id: 'surface',
    name: 'Surface operations',
    startDay: 213,
    endDay: 712,
    gravity: 0.38,
    description: '500 sols of surface science, EVA campaigns and habitat operations at 0.38 g.',
  },
  {
    id: 'ascent',
    name: 'Ascent & departure',
    startDay: 713,
    endDay: 720,
    gravity: 0,
    description: 'Mars ascent, rendezvous with the Earth-return vehicle and trans-Earth injection.',
  },
  {
    id: 'return',
    name: 'Return transit',
    startDay: 721,
    endDay: 893,
    gravity: 0,
    description: 'Cruise back to Earth. Deconditioning risk peaks before re-entry.',
  },
  {
    id: 'earth',
    name: 'Earth return & recovery',
    startDay: 894,
    endDay: 900,
    gravity: 1,
    description: 'Re-entry, recovery and start of post-flight rehabilitation.',
  },
]

export const MISSION: Mission = {
  name: 'Ares Meridiani',
  designation: 'ARES-7 / AURORA demonstration mission',
  description:
    'A fictional 900-day crewed Mars mission used to demonstrate AURORA. Four crew, outbound transit, 500 sols on the surface, return transit.',
  launchDate: '2033-03-14',
  totalDays: 900,
  currentDay: 412,
  destination: 'Mars — Meridiani Planum landing zone (fictional)',
  phases: PHASES,
}

export const EVENTS: MissionEvent[] = [
  { id: 'e-launch', day: 1, title: 'Launch', type: 'milestone', severity: 'info', description: 'Crew launch and rendezvous with the Ares transit vehicle in low Earth orbit.' },
  { id: 'e-tmi', day: 4, title: 'Trans-Mars injection burn', type: 'milestone', severity: 'info', description: 'Nominal departure burn. Begin 200-day outbound cruise.' },
  { id: 'e-ared-1', day: 45, title: 'Exercise hardware maintenance', type: 'systems', severity: 'info', description: 'Scheduled cable replacement on the resistive exercise device. 36 h reduced exercise capacity.' },
  { id: 'e-spe-1', day: 96, endDay: 98, title: 'Solar particle event — shelter protocol', type: 'radiation', severity: 'caution', description: 'Ground-forecast SPE. Crew sheltered in the storm shelter for 38 h. Dosimeters recorded an elevated dose over two days.' },
  { id: 'e-tcm', day: 150, title: 'Mid-course correction', type: 'milestone', severity: 'info', description: 'Trajectory correction manoeuvre TCM-3, 4.2 m/s.' },
  { id: 'e-moi', day: 206, title: 'Mars orbit insertion', type: 'milestone', severity: 'info', description: 'Capture burn into a 250 × 33,000 km orbit. Crew prepares the descent vehicle.' },
  { id: 'e-edl', day: 212, title: 'Landing at Meridiani base', type: 'milestone', severity: 'info', description: 'Entry, descent and landing 1.1 km from the pre-deployed habitat.' },
  { id: 'e-eva-1', day: 230, title: 'First surface EVA', type: 'operations', severity: 'info', description: 'Habitat external inspection and power-system hookup. 6 h 10 min.' },
  { id: 'e-hab', day: 260, title: 'Habitat fully commissioned', type: 'milestone', severity: 'info', description: 'Greenhouse, water recycling and radiation shelter operational. Nominal surface routine begins.' },
  { id: 'e-dust', day: 300, endDay: 306, title: 'Regional dust storm — EVA stand-down', type: 'environment', severity: 'watch', description: 'Optical depth above EVA limits. Crew confined to habitat for 7 days; solar power reduced to 60%.' },
  { id: 'e-conj', day: 335, endDay: 349, title: 'Solar conjunction — comms blackout', type: 'communications', severity: 'watch', description: 'Two weeks of degraded and intermittent Earth communication. Crew operates with full autonomy.' },
  { id: 'e-rover', day: 370, title: 'Long-traverse rover campaign begins', type: 'operations', severity: 'info', description: '14-day pressurised rover traverse to the crater rim. Ferreira and Arakawa.' },
  { id: 'e-ared-2', day: 388, endDay: 402, title: 'Treadmill drive fault', type: 'systems', severity: 'watch', description: 'Aerobic treadmill out of service. Crew limited to resistive exercise and cycle ergometer; Ferreira prioritised rover science over makeup sessions.' },
  { id: 'e-water', day: 395, endDay: 401, title: 'Water recycler repair shifts', type: 'systems', severity: 'watch', description: 'Urine processor fault. Arakawa worked extended night shifts for 7 days to restore closed-loop recovery.' },
  { id: 'e-spe-2', day: 405, title: 'Minor solar particle event', type: 'radiation', severity: 'watch', description: 'Small SPE partially attenuated by the Martian atmosphere and habitat regolith shielding.' },
  { id: 'e-pmc', day: 410, title: 'Private medical conference', type: 'medical', severity: 'info', description: 'Scheduled crew medical conference with the ground flight surgeon.' },
  { id: 'e-ascent', day: 713, title: 'Mars ascent (planned)', type: 'milestone', severity: 'info', description: 'Planned departure from the surface and rendezvous with the return vehicle.' },
  { id: 'e-return', day: 900, title: 'Earth return (planned)', type: 'milestone', severity: 'info', description: 'Planned re-entry and recovery.' },
]

export function phaseForDay(day: number): MissionPhase {
  return PHASES.find((p) => day >= p.startDay && day <= p.endDay) ?? PHASES[PHASES.length - 1]
}

export function missionDate(day: number): Date {
  const d = new Date(MISSION.launchDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + (day - 1))
  return d
}
