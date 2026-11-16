import type { StationId } from './deck'

/**
 * Mission objectives for the station.
 *
 * Every task below is completed by an action the visitor actually performs —
 * opening a particular console, selecting a crew member, reading a trend,
 * running the visor. None of them completes merely by walking into a module,
 * because an objective that ticks itself teaches nothing and is the kind of
 * fake progress this feature is supposed to avoid.
 *
 * These are educational objectives against synthetic data. They are not
 * clinical procedures and completing them establishes nothing medical.
 */

export type TaskId =
  | 'open-medical'
  | 'select-crew'
  | 'read-vitals'
  | 'read-trends'
  | 'open-alert'
  | 'open-veil'
  | 'veil-connect'
  | 'open-crew'
  | 'read-sleep'
  | 'open-environment'
  | 'change-scenario'
  | 'open-navigation'
  | 'open-comms'
  | 'open-research'
  | 'read-engine'
  // The fourteen procedures. Each closes only when every step of its
  // procedure has been performed; see model/procedures.ts.
  | 'proc-assessment'
  | 'proc-blood-pressure'
  | 'proc-ecg'
  | 'proc-pulse-ox'
  | 'proc-medication'
  | 'proc-sleep'
  | 'proc-exercise'
  | 'proc-med-kit'
  | 'proc-env-health'
  | 'proc-water'
  | 'proc-filter'
  | 'proc-veil'
  | 'proc-post-eva'
  | 'proc-final-report'
  // Extravehicular activity.
  | 'eva-suit-ready'
  | 'eva-egress'
  | 'eva-task-done'
  | 'eva-all-tasks'
  | 'eva-ingress'

export interface Task {
  id: TaskId
  label: string
  /** Where the task is performed, for the "go here" hint. */
  at: StationId
}

export interface Objective {
  id: string
  code: string
  title: string
  brief: string
  tasks: Task[]
}

export const OBJECTIVES: Objective[] = [
  {
    id: 'assessment',
    code: 'OBJ-01',
    title: 'Crew health assessment',
    brief:
      'Establish where the crew stands today. Open the medical console, choose a crew member and read what the monitoring has on them.',
    tasks: [
      { id: 'open-medical', label: 'Open the medical console', at: 'medical' },
      { id: 'select-crew', label: 'Select a crew member', at: 'medical' },
      { id: 'read-vitals', label: 'Read their current measurements', at: 'medical' },
    ],
  },
  {
    id: 'anomaly',
    code: 'OBJ-02',
    title: 'Anomaly investigation',
    brief:
      'Something has been flagged. Find whose it is, then look at the history behind it rather than the flag alone.',
    tasks: [
      { id: 'open-alert', label: 'Review a flagged item in the medical bay', at: 'medical' },
      { id: 'read-trends', label: 'Open the crew health trends', at: 'medical' },
    ],
  },
  {
    id: 'sleep',
    code: 'OBJ-03',
    title: 'Sleep and recovery',
    brief: 'Sleep is the first thing to move on a long mission. Check the crew quarters for what the record shows.',
    tasks: [
      { id: 'open-crew', label: 'Open the crew quarters console', at: 'crew' },
      { id: 'read-sleep', label: 'Compare sleep across the crew', at: 'crew' },
    ],
  },
  {
    id: 'environment',
    code: 'OBJ-04',
    title: 'Environmental assessment',
    brief:
      'Cabin conditions and mission parameters both bear on crew health. Open environmental control and move the model.',
    tasks: [
      { id: 'open-environment', label: 'Open environmental control', at: 'environment' },
      { id: 'change-scenario', label: 'Change a mission scenario parameter', at: 'environment' },
    ],
  },
  {
    id: 'research',
    code: 'OBJ-06',
    title: 'Laboratory review',
    brief:
      'The engine is the reason any of this is more than a chart. Open the laboratory console and read what it is tracking and what it has flagged.',
    tasks: [
      { id: 'open-research', label: 'Open the laboratory console', at: 'research' },
      { id: 'read-engine', label: "Review the engine's current findings", at: 'research' },
    ],
  },
  {
    id: 'clinical-ops',
    code: 'OBJ-07',
    title: 'Medical operations',
    brief:
      'The medical bay is equipped for more than reading charts. Work through the routine assessment and the instrument procedures that go with it.',
    tasks: [
      { id: 'proc-assessment', label: 'Complete the routine health assessment', at: 'medical' },
      { id: 'proc-blood-pressure', label: 'Measure blood pressure', at: 'medical' },
      { id: 'proc-ecg', label: 'Run an ECG monitoring session', at: 'medical' },
      { id: 'proc-pulse-ox', label: 'Monitor oxygen saturation', at: 'medical' },
    ],
  },
  {
    id: 'supplies',
    code: 'OBJ-08',
    title: 'Medical supplies',
    brief:
      'A station is only as equipped as its inventory says it is. Count the pharmacy and check the portable kits.',
    tasks: [
      { id: 'proc-medication', label: 'Inventory and administer medication', at: 'medical' },
      { id: 'proc-med-kit', label: 'Inventory the medical kits', at: 'medical' },
    ],
  },
  {
    id: 'countermeasures',
    code: 'OBJ-09',
    title: 'Countermeasures and recovery',
    brief:
      'Sleep and exercise are the two countermeasures a crew actually controls. Review one and log the other.',
    tasks: [
      { id: 'proc-sleep', label: 'Review sleep and recovery', at: 'crew' },
      { id: 'proc-exercise', label: 'Log an exercise countermeasure session', at: 'environment' },
    ],
  },
  {
    id: 'habitability',
    code: 'OBJ-10',
    title: 'Habitability and water',
    brief:
      'Crew health is downstream of the cabin. Assess the environment, inspect the water and change the processor filter.',
    tasks: [
      { id: 'proc-env-health', label: 'Assess environmental health', at: 'environment' },
      { id: 'proc-water', label: 'Inspect the potable water', at: 'environment' },
      { id: 'proc-filter', label: 'Replace the water filter', at: 'environment' },
    ],
  },
  {
    id: 'eva',
    code: 'OBJ-11',
    title: 'Extravehicular activity',
    brief:
      'Prepare a suit, take the airlock through its pressure sequence, go outside and work the exterior tasks, then come back in and close out.',
    tasks: [
      { id: 'eva-suit-ready', label: 'Prepare and don an EVA suit', at: 'medical' },
      { id: 'eva-egress', label: 'Complete the egress sequence', at: 'medical' },
      { id: 'eva-task-done', label: 'Complete an exterior maintenance task', at: 'medical' },
      { id: 'eva-ingress', label: 'Return through the airlock', at: 'medical' },
      { id: 'proc-post-eva', label: 'Run the post-EVA medical review', at: 'medical' },
    ],
  },
  {
    id: 'report',
    code: 'OBJ-12',
    title: 'Mission health report',
    brief: 'Draw it together: what moved, what the engine found, and what none of it establishes.',
    tasks: [
      { id: 'proc-veil', label: 'Investigate a multi-signal anomaly', at: 'research' },
      { id: 'proc-final-report', label: 'Issue the final mission health report', at: 'medical' },
    ],
  },
  {
    id: 'veil',
    code: 'OBJ-05',
    title: 'Signal Veil analysis',
    brief:
      'Single indicators can all look ordinary while moving together. Take the selected crew member into the visor and look for it.',
    tasks: [
      { id: 'open-veil', label: 'Open Signal Veil from the medical bay', at: 'medical' },
      { id: 'veil-connect', label: 'Trace a relationship in the visor', at: 'medical' },
    ],
  },
]

/** Tasks that belong to an objective. */
export const ALL_TASKS: TaskId[] = OBJECTIVES.flatMap((o) => o.tasks.map((t) => t.id))

/**
 * Every task the station can report, objective or not. Reaching the navigation
 * and communications consoles is recorded even though no objective asks for
 * it, so persistence has to accept them or they would be dropped on reload.
 */
export const KNOWN_TASKS: TaskId[] = [...ALL_TASKS, 'open-navigation', 'open-comms', 'eva-all-tasks']

const KEY = 'aurora.deck.objectives.v1'

export function loadProgress(): TaskId[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is TaskId => typeof t === 'string' && (KNOWN_TASKS as string[]).includes(t))
  } catch {
    return []
  }
}

export function saveProgress(done: TaskId[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(done))
  } catch {
    /* storage unavailable */
  }
}

/**
 * Step-level progress, kept separately from the task list.
 *
 * A procedure's or a worksite's individual steps are not tasks — a task is
 * closed by finishing all of them — and the two are stored apart so that
 * neither can corrupt the other's shape. Unlike `loadProgress`, the keys here
 * are validated against a caller-supplied set, because they belong to the
 * procedure and EVA models rather than to this one.
 */
const STEP_KEY = 'aurora.deck.steps.v1'

export function loadSteps(valid: readonly string[]): string[] {
  try {
    const raw = localStorage.getItem(STEP_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const ok = new Set(valid)
    return parsed.filter((t): t is string => typeof t === 'string' && ok.has(t))
  } catch {
    return []
  }
}

export function saveSteps(steps: readonly string[]): void {
  try {
    localStorage.setItem(STEP_KEY, JSON.stringify(steps))
  } catch {
    /* storage unavailable */
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(STEP_KEY)
  } catch {
    /* storage unavailable */
  }
}

export function objectiveDone(o: Objective, done: readonly TaskId[]): boolean {
  return o.tasks.every((t) => done.includes(t.id))
}

/** The first objective not yet finished, which is what the briefing leads with. */
export function currentObjective(done: readonly TaskId[]): Objective | null {
  return OBJECTIVES.find((o) => !objectiveDone(o, done)) ?? null
}
