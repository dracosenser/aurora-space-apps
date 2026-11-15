import type { CheckId, SystemId } from './selfcheck'

/**
 * The five body systems the tool reports on, each tied to the hazards that act
 * on it and the readings that observe it. Countermeasures are the operational
 * ones a crew actually runs — exercise prescription, shielding, timeline
 * relief — never a treatment.
 */

export interface BodySystem {
  id: SystemId
  label: string
  /** What the system does, in plain language. */
  does: string
  /** What long-duration spaceflight does to it. */
  inFlight: string
  /** The hazards that drive it, by id. */
  hazards: HazardId[]
  /** Readings that report on this system. */
  checks: CheckId[]
  /** What the crew does about it. */
  countermeasures: string[]
  /** Clickable region on the figure, as an SVG path in a 200×430 viewBox. */
  region: string
  /** Where the callout line leaves the figure. */
  anchor: [number, number]
}

export type HazardId = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'closed'

export interface Hazard {
  id: HazardId
  label: string
  blurb: string
  systems: SystemId[]
}

/** NASA's Human Research Program frames five hazards of human spaceflight. */
export const HAZARDS: Hazard[] = [
  {
    id: 'radiation',
    label: 'Space radiation',
    blurb:
      'Beyond the magnetosphere the crew is exposed to galactic cosmic rays and solar particle events. Dose accumulates for the whole mission and cannot be undone — only limited.',
    systems: ['immune', 'sensory', 'cardiovascular'],
  },
  {
    id: 'isolation',
    label: 'Isolation and confinement',
    blurb:
      'A small crew in a small volume for years, with no change of company and no way out. Behavioural health is a mission-critical system, not a personal matter.',
    systems: ['neurobehavioral'],
  },
  {
    id: 'distance',
    label: 'Distance from Earth',
    blurb:
      'At Mars distance a message takes up to twenty minutes each way and resupply is not possible. The crew is its own clinic, pharmacy and emergency service.',
    systems: ['neurobehavioral', 'immune'],
  },
  {
    id: 'gravity',
    label: 'Gravity fields',
    blurb:
      'Weightlessness unloads the skeleton and the heart, then a partial-gravity surface reloads them. Each transition is its own adaptation, and each costs something.',
    systems: ['musculoskeletal', 'cardiovascular', 'sensory'],
  },
  {
    id: 'closed',
    label: 'Hostile closed environment',
    blurb:
      'A sealed habitat with recycled air and water, constant noise and a microbial community that drifts over time. The environment itself is a health variable.',
    systems: ['immune', 'neurobehavioral'],
  },
]

export const HAZARD_BY_ID = Object.fromEntries(HAZARDS.map((h) => [h.id, h])) as Record<HazardId, Hazard>

export const BODY_SYSTEMS: BodySystem[] = [
  {
    id: 'neurobehavioral',
    label: 'Neurological & behavioural',
    does: 'Sleep, attention, mood, judgement and the error rate behind every task on the timeline.',
    inFlight:
      'A 90-minute orbital day, continuous noise and an unchanging crew erode sleep and mood together. Performance degrades before the crew member notices it.',
    hazards: ['isolation', 'distance', 'closed'],
    checks: ['sleepHours', 'mood'],
    countermeasures: [
      'Protect the pre-sleep hour; move non-critical work out of it',
      'Private crew conference slots, used routinely rather than on escalation',
      'Light scheduling that holds a stable circadian anchor',
    ],
    region: 'M100 34 m-21 0 a21 21 0 1 0 42 0 a21 21 0 1 0 -42 0',
    anchor: [121, 34],
  },
  {
    id: 'sensory',
    label: 'Visual & vestibular',
    does: 'Sight, balance and spatial orientation — how you know which way is up and whether you can read the panel.',
    inFlight:
      'Headward fluid shift raises intracranial pressure and can flatten the back of the eye, degrading near vision. The balance organs re-learn after every gravity transition.',
    hazards: ['gravity', 'radiation'],
    checks: [],
    countermeasures: [
      'Scheduled visual acuity and fundus checks',
      'Lower-body negative pressure sessions to pull fluid footward',
      'Re-adaptation protocol after each gravity transition',
    ],
    region: 'M100 30 m-12 0 a12 5 0 1 0 24 0 a12 5 0 1 0 -24 0',
    anchor: [88, 30],
  },
  {
    id: 'cardiovascular',
    label: 'Cardiovascular',
    does: 'Moves blood, oxygen and heat. Sets how much work you can do before you run out.',
    inFlight:
      'Without gravity the heart works against less column pressure, loses mass and the vessels decondition. Circulating volume falls. The cost is paid on reloading.',
    hazards: ['gravity', 'radiation'],
    checks: ['systolic', 'diastolic', 'heartRate', 'spo2'],
    countermeasures: [
      'Daily aerobic prescription at the assigned intensity',
      'Fluid and salt loading before a gravity transition',
      'Resting heart rate trend taken before rising, every day',
    ],
    region: 'M100 100 m-19 0 a19 23 0 1 0 38 0 a19 23 0 1 0 -38 0',
    anchor: [119, 96],
  },
  {
    id: 'immune',
    label: 'Immune & metabolic',
    does: 'Defends against infection, manages fuel, and keeps the gut and its microbial community stable.',
    inFlight:
      'Immune regulation shifts, latent viruses can reactivate, and insulin sensitivity drifts while dietary variety is fixed by what was launched.',
    hazards: ['radiation', 'closed', 'distance'],
    checks: ['temperature', 'glucose'],
    countermeasures: [
      'Daily temperature trend and symptom log',
      'Fasting glucose on the scheduled cadence',
      'Isolation protocol the moment a febrile trend appears',
    ],
    region: 'M100 152 m-17 0 a17 19 0 1 0 34 0 a17 19 0 1 0 -34 0',
    anchor: [117, 152],
  },
  {
    id: 'musculoskeletal',
    label: 'Musculoskeletal',
    does: 'Bone, muscle and the loaded structure that lets you work, egress and survive a landing.',
    inFlight:
      'Unloaded bone demineralises at roughly one to two percent per month at weight-bearing sites, and postural muscle atrophies. Both are largely preventable, and only by loading.',
    hazards: ['gravity'],
    checks: [],
    countermeasures: [
      'Resistive exercise at prescribed load — the single most effective countermeasure flown',
      'Grip and calf-circumference trend as a cheap proxy between scans',
      'Protein and calcium targets held even when appetite drops',
    ],
    region: 'M80 184 h14 v150 h-14 z M106 184 h14 v150 h-14 z',
    anchor: [80, 262],
  },
]

export const SYSTEM_BY_ID = Object.fromEntries(BODY_SYSTEMS.map((s) => [s.id, s])) as Record<SystemId, BodySystem>

/** The line-art figure the regions sit on, in a 200×380 viewBox. */
export const FIGURE_PATHS = [
  // skull and neck
  'M100 34 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0',
  'M92 53 v11 M108 53 v11',
  // shoulders and tapering trunk
  'M66 68 Q100 60 134 68',
  'M66 68 L72 150 L80 182 H120 L128 150 L134 68',
  // arms, hanging from the shoulder line
  'M67 70 L54 122 L48 170 M133 70 L146 122 L152 170',
  'M48 170 l-4 12 M152 170 l4 12',
  // legs
  'M88 182 L85 262 L87 332 M112 182 L115 262 L113 332',
  // feet
  'M77 333 H93 M107 333 H123',
  // waist rule
  'M80 182 H120',
]
