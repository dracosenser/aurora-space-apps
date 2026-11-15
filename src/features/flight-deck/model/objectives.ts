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
export const KNOWN_TASKS: TaskId[] = [...ALL_TASKS, 'open-navigation', 'open-comms']

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

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY)
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
