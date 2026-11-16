import type { Astronaut, DailyRecord } from '../../../types'
import type { StationId } from './deck'
import type { TaskId } from './objectives'

/**
 * Medical and environmental procedures carried out aboard the station.
 *
 * Each is a short sequence a crew member works through at a console, and each
 * step has to be performed: there is no procedure here that completes by being
 * opened, and none that completes on a timer.
 *
 * The readings are the important part. Where a step reports a number it comes
 * from the same synthetic record set the rest of AURORA reads — this crew
 * member's own latest day, and their own early-mission baseline — so a blood
 * pressure taken here matches the blood pressure the chart shows, and moving
 * the mission day moves both. Nothing is invented at the point of display.
 *
 * ── Not clinical ──────────────────────────────────────────────────────────
 * These are familiarisation exercises against generated data. They are not
 * procedures, the readings describe nobody, and completing one establishes
 * nothing medical. Every screen that shows one says so.
 */

export interface ProcContext {
  who: Astronaut
  /** The crew member's most recent synthetic record, if any. */
  now: DailyRecord | undefined
  /** Their own early-mission mean, per indicator. */
  base: Partial<Record<keyof DailyRecord, number>>
  day: number
  /** Whether a spacewalk has been completed this session. */
  evaDone: boolean
  /** Seconds spent outside, compressed. */
  evaSeconds: number
}

export interface ProcStep {
  id: string
  /** What the crew member does. */
  label: string
  /** The outcome, usually computed from the record. */
  read: (c: ProcContext) => string
}

export type ProcedureId =
  | 'assessment' | 'blood-pressure' | 'ecg' | 'pulse-ox' | 'medication'
  | 'sleep-review' | 'exercise' | 'med-kit' | 'env-health' | 'water-quality'
  | 'water-filter' | 'veil-anomaly' | 'post-eva' | 'final-report'

export interface Procedure {
  id: ProcedureId
  code: string
  title: string
  /** The console it is performed at. */
  at: StationId
  brief: string
  /** The objective task this closes when every step is done. */
  task: TaskId
  steps: ProcStep[]
  /** Shown instead of the steps when the precondition is not met. */
  requires?: (c: ProcContext) => string | null
}

const n = (v: number | undefined, d = 0, unit = '') =>
  v == null ? 'no reading' : `${v.toFixed(d)}${unit ? ' ' + unit : ''}`

/** Signed change against this crew member's own baseline. */
function delta(now: number | undefined, base: number | undefined, d = 0, unit = ''): string {
  if (now == null || base == null || !base) return 'no baseline'
  const diff = now - base
  const pct = (diff / base) * 100
  return `${diff > 0 ? '+' : ''}${diff.toFixed(d)}${unit ? ' ' + unit : ''} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%) against their own baseline`
}

export const PROCEDURES: Procedure[] = [
  {
    id: 'assessment',
    code: 'MED-01',
    title: 'Routine health assessment',
    at: 'medical',
    task: 'proc-assessment',
    brief: 'The standing daily check: who is being assessed, what the monitoring has, and whether anything is flagged.',
    steps: [
      { id: 'identify', label: 'Confirm the crew member', read: (c) => `${c.who.name}, ${c.who.role}. Mission day ${c.day}.` },
      { id: 'vitals', label: 'Pull the current vitals', read: (c) => `Heart rate ${n(c.now?.restingHR, 0, 'bpm')}, HRV ${n(c.now?.hrv, 0, 'ms')}, blood pressure ${n(c.now?.systolicBP, 0)}/${n(c.now?.diastolicBP, 0, 'mmHg')}. Synthetic.` },
      { id: 'compare', label: 'Compare against their baseline', read: (c) => `Resting heart rate ${delta(c.now?.restingHR, c.base.restingHR, 1, 'bpm')}.` },
      { id: 'record', label: 'Record the assessment', read: () => 'Assessment filed against today. No clinical conclusion is drawn from it.' },
    ],
  },
  {
    id: 'blood-pressure',
    code: 'MED-02',
    title: 'Blood pressure measurement',
    at: 'medical',
    task: 'proc-blood-pressure',
    brief: 'Cuff measurement with the automated sphygmomanometer in the medical bay.',
    steps: [
      { id: 'cuff', label: 'Fit the cuff and restrain the arm', read: () => 'Cuff on the upper arm, crew member restrained at the work surface. Free fall changes the fluid distribution, so position matters more here than on the ground.' },
      { id: 'inflate', label: 'Run the measurement', read: (c) => `Reading ${n(c.now?.systolicBP, 0)}/${n(c.now?.diastolicBP, 0)} mmHg. Synthetic.` },
      { id: 'repeat', label: 'Take a second reading', read: (c) => `Second reading agrees within the device's stated tolerance. Mean arterial pressure about ${c.now ? (((c.now.systolicBP + 2 * c.now.diastolicBP) / 3)).toFixed(0) : '—'} mmHg, calculated from the two numbers above.` },
      { id: 'log', label: 'Log it to the record', read: (c) => `Logged. Systolic ${delta(c.now?.systolicBP, c.base.systolicBP, 1, 'mmHg')}.` },
    ],
  },
  {
    id: 'ecg',
    code: 'MED-03',
    title: 'ECG monitoring session',
    at: 'medical',
    task: 'proc-ecg',
    brief: 'A short rhythm strip with the chest leads, and the heart rate variability that comes out of it.',
    steps: [
      { id: 'electrodes', label: 'Place the electrodes', read: () => 'Four leads placed. Skin prepared; the adhesive is the usual problem in a dry cabin.' },
      { id: 'record', label: 'Record the strip', read: (c) => `Rate ${n(c.now?.restingHR, 0, 'bpm')}, regular. Synthetic trace.` },
      { id: 'hrv', label: 'Derive heart rate variability', read: (c) => `HRV ${n(c.now?.hrv, 0, 'ms')} — ${delta(c.now?.hrv, c.base.hrv, 1, 'ms')}. HRV falls with accumulated stress and poor sleep, which is why it is tracked alongside them.` },
      { id: 'file', label: 'File the strip', read: () => 'Strip stored against the mission record. No rhythm interpretation is offered here.' },
    ],
  },
  {
    id: 'pulse-ox',
    code: 'MED-04',
    title: 'Oxygen saturation monitoring',
    at: 'medical',
    task: 'proc-pulse-ox',
    brief: 'Fingertip pulse oximetry, read alongside the cabin atmosphere it depends on.',
    steps: [
      { id: 'probe', label: 'Fit the probe', read: () => 'Probe on the index finger, hand still, ambient light shielded.' },
      { id: 'read', label: 'Take the reading', read: () => 'Saturation 97%, pulse waveform steady. Synthetic: this indicator is not part of the generated record set and is shown as a fixed plausible value, not as data.' },
      { id: 'cabin', label: 'Cross-check the cabin atmosphere', read: () => 'Cabin partial pressure of oxygen within its normal band at environmental control. A saturation reading means little without the atmosphere it was taken in.' },
      { id: 'log', label: 'Log the result', read: () => 'Logged with the atmosphere reading beside it.' },
    ],
  },
  {
    id: 'medication',
    code: 'MED-05',
    title: 'Medication inventory and administration',
    at: 'medical',
    task: 'proc-medication',
    brief: 'Count the pharmacy, check what is near expiry, and run through a single administration against the record.',
    steps: [
      { id: 'open', label: 'Open the medication locker', read: () => 'Locker open. Contents restrained in labelled trays, as everything in a free-fall cabin has to be.' },
      { id: 'count', label: 'Count against the manifest', read: () => 'Simulated inventory: 14 line items, 12 at full count, 2 part-used. No discrepancy against the manifest.' },
      { id: 'expiry', label: 'Check expiry dates', read: (c) => `Two items reach their stated expiry before mission day ${c.day + 90}. Flagged for resupply rather than disposal.` },
      { id: 'administer', label: 'Run a simulated administration', read: (c) => `Exercise only: item selected, crew member identified as ${c.who.name}, dose confirmed against the manifest, administration recorded. No medicine is named and no dose is given, because this is a simulation of the paperwork and not of the pharmacology.` },
      { id: 'close', label: 'Close and seal the locker', read: () => 'Locker closed, seal intact, inventory filed.' },
    ],
  },
  {
    id: 'sleep-review',
    code: 'MED-06',
    title: 'Sleep and recovery review',
    at: 'crew',
    task: 'proc-sleep',
    brief: 'What the sleep record shows for this crew member, and how it sits against the rest of the crew.',
    steps: [
      { id: 'duration', label: 'Read the sleep duration', read: (c) => `${n(c.now?.sleepDuration, 1, 'h')} last night — ${delta(c.now?.sleepDuration, c.base.sleepDuration, 1, 'h')}.` },
      { id: 'quality', label: 'Read the sleep quality and consistency', read: (c) => `Quality ${n(c.now?.sleepQuality, 0)}/100, consistency ${n(c.now?.sleepConsistency, 0)}/100. Consistency is the one that tends to move first on a long mission.` },
      { id: 'context', label: 'Put it beside stress and fatigue', read: (c) => `Stress ${n(c.now?.stress, 0)}/100, fatigue ${n(c.now?.fatigue, 0)}/100. These three move together more often than any of them moves alone, which is the whole argument for looking at them that way.` },
      { id: 'note', label: 'Add a note to the record', read: () => 'Note filed. Nothing here is a diagnosis of a sleep disorder.' },
    ],
  },
  {
    id: 'exercise',
    code: 'MED-07',
    title: 'Exercise countermeasure session',
    at: 'environment',
    task: 'proc-exercise',
    brief: 'Log a resistive session on the exercise hardware and read what the countermeasure indicators show.',
    steps: [
      { id: 'setup', label: 'Set up the resistive device', read: () => 'Cylinders loaded, bar at the right height, crew member in the foot restraint.' },
      { id: 'session', label: 'Run the session', read: (c) => `Logged ${n(c.now?.exerciseMinutes, 0, 'minutes')} today — ${delta(c.now?.exerciseMinutes, c.base.exerciseMinutes, 0, 'min')}.` },
      { id: 'muscle', label: 'Read the countermeasure indicators', read: (c) => `Muscle strength index ${n(c.now?.muscleStrength, 1)}, bone density index ${n(c.now?.boneDensity, 1)}. Both are the reason the exercise hardware takes up as much of a station as it does.` },
      { id: 'log', label: 'File the session', read: () => 'Session filed against the countermeasure record.' },
    ],
  },
  {
    id: 'med-kit',
    code: 'MED-08',
    title: 'Medical kit inventory',
    at: 'medical',
    task: 'proc-med-kit',
    brief: 'Check the portable kits are complete and where they are supposed to be.',
    steps: [
      { id: 'locate', label: 'Locate both kits', read: () => 'Primary kit in the medical bay, secondary in the spine by the aft hatch. Both at their stowage points.' },
      { id: 'seals', label: 'Check the seals', read: () => 'Simulated check: seals intact on both. An intact seal is how you know a kit is complete without opening it.' },
      { id: 'contents', label: 'Open and inventory the primary kit', read: () => 'Simulated inventory: airway, haemorrhage control, diagnostics and the restraint set all present and in date.' },
      { id: 'restow', label: 'Reseal and restow', read: () => 'Both kits resealed and restowed. Inventory filed.' },
    ],
  },
  {
    id: 'env-health',
    code: 'ENV-01',
    title: 'Environmental health assessment',
    at: 'environment',
    task: 'proc-env-health',
    brief: 'Cabin conditions, and the radiation the crew is accumulating in them.',
    steps: [
      { id: 'atmos', label: 'Read the cabin atmosphere', read: () => 'Simulated: pressure, oxygen partial pressure and carbon dioxide all within their normal bands. Carbon dioxide is the one that tracks with headache and fatigue reports.' },
      { id: 'radiation', label: 'Read the radiation record', read: (c) => `Daily dose ${n(c.now?.radiationDaily, 2, 'mSv')}, cumulative ${n(c.now?.radiationCumulative, 1, 'mSv')} for ${c.who.name}. Synthetic.` },
      { id: 'scenario', label: 'Check the active scenario', read: () => 'The radiation case driving these numbers is set at this console and feeds the mission model the rest of AURORA uses.' },
      { id: 'file', label: 'File the assessment', read: () => 'Environmental assessment filed alongside the crew records.' },
    ],
  },
  {
    id: 'water-quality',
    code: 'ENV-02',
    title: 'Potable water inspection',
    at: 'environment',
    task: 'proc-water',
    brief: 'Sample the potable supply and check it against the limits the processor is meant to hold.',
    steps: [
      { id: 'sample', label: 'Draw a sample from the dispenser', read: () => 'Sample drawn into a sealed pouch at the galley dispenser.' },
      { id: 'test', label: 'Run the test kit', read: () => 'Simulated: conductivity, pH and total organic carbon all inside their limits. Biocide concentration at the low end of its band.' },
      { id: 'biocide', label: 'Check the biocide margin', read: () => 'Low but in band. Worth watching rather than acting on, which is the kind of call this instrument is for.' },
      { id: 'log', label: 'Log the result', read: () => 'Water quality logged against today.' },
    ],
  },
  {
    id: 'water-filter',
    code: 'ENV-03',
    title: 'Water filter replacement',
    at: 'environment',
    task: 'proc-filter',
    brief: 'Change the processor filter and prove the loop afterwards.',
    steps: [
      { id: 'isolate', label: 'Isolate the processing loop', read: () => 'Loop isolated, pump stopped, residual pressure vented to the collection bag. Nothing is opened in a wet loop under pressure.' },
      { id: 'remove', label: 'Remove the spent filter', read: () => 'Spent cartridge out and bagged. Discolouration consistent with its service life.' },
      { id: 'install', label: 'Install the replacement', read: () => 'New cartridge seated, O-ring checked and lubricated, housing torqued by hand to the mark.' },
      { id: 'prove', label: 'Restore and prove the loop', read: () => 'Loop restored, pump restarted, no leak at the housing. Simulated flow and pressure back to nominal.' },
      { id: 'log', label: 'Log the change', read: () => 'Filter change logged with the hours on the old cartridge.' },
    ],
  },
  {
    id: 'veil-anomaly',
    code: 'MED-09',
    title: 'Multi-signal anomaly investigation',
    at: 'research',
    task: 'proc-veil',
    brief: 'Use the Signal Veil instrument to look at several indicators together rather than one at a time.',
    steps: [
      { id: 'open', label: 'Open the instrument on this crew member', read: (c) => `Signal Veil loaded for ${c.who.name}.` },
      { id: 'overlap', label: 'Look for temporal overlap', read: () => 'The engine looks for indicators that move at the same time rather than for any one crossing a threshold, which is how a pattern shows up while every single reading still looks ordinary.' },
      { id: 'trace', label: 'Trace a relationship', read: (c) => `Relationship traced in the visor for ${c.who.name}. What it establishes is a correlation in generated data and nothing more.` },
      { id: 'file', label: 'File what was found', read: () => 'Finding filed to the research record.' },
    ],
  },
  {
    id: 'post-eva',
    code: 'MED-10',
    title: 'Post-EVA medical review',
    at: 'medical',
    task: 'proc-post-eva',
    brief: 'The check after a spacewalk: how long the crew member was outside, and what their indicators look like now.',
    requires: (c) => (c.evaDone ? null : 'No spacewalk has been completed yet. This review opens once a crew member has been outside and returned through the airlock.'),
    steps: [
      { id: 'duration', label: 'Record the excursion time', read: (c) => `${Math.floor(c.evaSeconds / 60)}:${String(Math.floor(c.evaSeconds % 60)).padStart(2, '0')} outside, on this simulation's compressed clock. A real excursion of this scope would be several hours.` },
      { id: 'vitals', label: 'Take post-EVA vitals', read: (c) => `Heart rate ${n(c.now?.restingHR, 0, 'bpm')}, blood pressure ${n(c.now?.systolicBP, 0)}/${n(c.now?.diastolicBP, 0, 'mmHg')}. These are the same synthetic daily values the record holds: this simulation does not model a physiological response to the excursion, and it would be dishonest to show a number that implied one.` },
      { id: 'compare', label: 'Compare against the baseline', read: (c) => `Resting heart rate ${delta(c.now?.restingHR, c.base.restingHR, 1, 'bpm')}. The comparison is against their own early-mission mean, not against a pre-EVA reading, because no separate pre-EVA measurement exists in this data.` },
      { id: 'symptoms', label: 'Run the post-EVA questionnaire', read: () => 'Simulated: no decompression symptoms, no joint pain, no visual disturbance, hands sore as usual after a long day in the gloves.' },
      { id: 'file', label: 'File the review', read: () => 'Post-EVA review filed against the mission record.' },
    ],
  },
  {
    id: 'final-report',
    code: 'MED-11',
    title: 'Final mission health report',
    at: 'medical',
    task: 'proc-final-report',
    brief: 'Draw the whole thing together: where the crew stands, what moved, and what the engine flagged.',
    steps: [
      { id: 'roster', label: 'Summarise the crew', read: (c) => `Four crew members on the roster. Report compiled against mission day ${c.day}.` },
      { id: 'movers', label: 'List what has moved from baseline', read: (c) => `For ${c.who.name}: heart rate ${delta(c.now?.restingHR, c.base.restingHR, 1, 'bpm')}; HRV ${delta(c.now?.hrv, c.base.hrv, 1, 'ms')}; sleep ${delta(c.now?.sleepDuration, c.base.sleepDuration, 1, 'h')}.` },
      { id: 'engine', label: 'Include the engine findings', read: () => 'The constellation findings and their supporting indicators are attached as they stand at this mission day.' },
      { id: 'caveat', label: 'Attach the standing caveat', read: () => 'Attached: this report describes generated data for an educational exercise. It is not a medical record, it describes no real person, and nothing in it is a clinical finding.' },
      { id: 'issue', label: 'Issue the report', read: () => 'Report issued to the mission record.' },
    ],
  },
]

export const PROCEDURES_AT = (at: StationId): Procedure[] => PROCEDURES.filter((p) => p.at === at)
export const PROC_BY_ID = Object.fromEntries(PROCEDURES.map((p) => [p.id, p])) as Record<ProcedureId, Procedure>

/** Qualified key for a completed step, as stored in mission progress. */
export function procStepKey(p: ProcedureId, step: string): string {
  return `${p}:${step}`
}

export function procComplete(p: Procedure, done: readonly string[]): boolean {
  return p.steps.every((s) => done.includes(procStepKey(p.id, s.id)))
}

/** The next step, so they cannot be taken out of order. */
export function nextProcStep(p: Procedure, done: readonly string[]): ProcStep | null {
  for (const s of p.steps) if (!done.includes(procStepKey(p.id, s.id))) return s
  return null
}

/** Each crew member's own early-mission mean, which is what every delta uses. */
export function baselineOf(records: readonly DailyRecord[]): Partial<Record<keyof DailyRecord, number>> {
  const early = records.slice(0, 30)
  if (early.length === 0) return {}
  const keys: (keyof DailyRecord)[] = [
    'restingHR', 'hrv', 'systolicBP', 'diastolicBP', 'sleepDuration',
    'sleepConsistency', 'sleepQuality', 'exerciseMinutes', 'muscleStrength',
    'boneDensity', 'stress', 'mood', 'fatigue',
  ]
  const out: Partial<Record<keyof DailyRecord, number>> = {}
  for (const k of keys) {
    let sum = 0
    let n2 = 0
    for (const r of early) {
      const v = r[k]
      if (typeof v === 'number') {
        sum += v
        n2++
      }
    }
    if (n2) out[k] = sum / n2
  }
  return out
}

/** Every procedure step key, for validating what comes out of storage. */
export const ALL_PROC_STEPS: string[] = PROCEDURES.flatMap((p) =>
  p.steps.map((s) => procStepKey(p.id, s.id)),
)
