/**
 * The self-assessment battery: the measurements a crew member takes on
 * themselves, with the instruction for taking each one, what spaceflight does
 * to it, and the operational action a reading calls for.
 *
 * IMPORTANT — these bands are general adult reference values used to drive a
 * demonstration. They are not clinical thresholds, they are not personalised,
 * and no entry here recommends a treatment. Every escalation routes to the
 * flight surgeon, which is what the real protocol does.
 */

export type CheckId =
  | 'systolic'
  | 'diastolic'
  | 'heartRate'
  | 'spo2'
  | 'temperature'
  | 'glucose'
  | 'sleepHours'
  | 'mood'

export type Band = 'nominal' | 'watch' | 'caution'

export interface CheckDef {
  id: CheckId
  label: string
  short: string
  unit: string
  /** Input bounds for the capture control. */
  min: number
  max: number
  step: number
  /** A plausible starting value so the control never opens empty. */
  seed: number
  decimals: number
  /** Body system this reading reports on. */
  system: SystemId
  /** How the crew member takes this measurement aboard. */
  how: string
  /** Why it is worth taking in spaceflight specifically. */
  why: string
  /** The reference band used by this demonstration. */
  nominal: [number, number]
  /** Outside this, the reading is treated as needing attention. */
  watch: [number, number]
  /** What to do, in operational terms. Never a treatment. */
  action: Record<Band, string>
}

export type SystemId = 'cardiovascular' | 'musculoskeletal' | 'neurobehavioral' | 'immune' | 'sensory'

export const CHECKS: CheckDef[] = [
  {
    id: 'systolic',
    label: 'Blood pressure — systolic',
    short: 'SYS',
    unit: 'mmHg',
    min: 70,
    max: 190,
    step: 1,
    seed: 118,
    decimals: 0,
    system: 'cardiovascular',
    how: 'Seated, cuff at heart level, five minutes rest first. Take two readings a minute apart and log the second.',
    why: 'Without gravity pulling blood toward the feet, fluid shifts headward. The heart adapts to a smaller circulating volume, and the deconditioned response shows up first on return loading.',
    nominal: [95, 125],
    watch: [85, 140],
    action: {
      nominal: 'Within the crew reference band. Log and continue the routine.',
      watch: 'Repeat after ten minutes of rest. If the second reading agrees, flag it in the daily downlink.',
      caution: 'Repeat now and notify the flight surgeon on the next comms pass. Do not begin exercise until cleared.',
    },
  },
  {
    id: 'diastolic',
    label: 'Blood pressure — diastolic',
    short: 'DIA',
    unit: 'mmHg',
    min: 40,
    max: 120,
    step: 1,
    seed: 76,
    decimals: 0,
    system: 'cardiovascular',
    how: 'Read from the same cuff measurement as systolic. Log both numbers together.',
    why: 'Diastolic pressure tracks the resistance the heart works against. Paired with systolic it separates a fluid-shift response from a vascular one.',
    nominal: [60, 82],
    watch: [52, 92],
    action: {
      nominal: 'Within the crew reference band. Log and continue.',
      watch: 'Recheck with the systolic reading. Note any headache or visual change in the log.',
      caution: 'Recheck now and notify the flight surgeon on the next comms pass.',
    },
  },
  {
    id: 'heartRate',
    label: 'Resting heart rate',
    short: 'HR',
    unit: 'bpm',
    min: 35,
    max: 140,
    step: 1,
    seed: 62,
    decimals: 0,
    system: 'cardiovascular',
    how: 'Before rising, before caffeine. Count for a full sixty seconds rather than scaling a short count.',
    why: 'Resting rate drifts up when sleep debt, dehydration or early illness accumulate. It is the cheapest early signal the crew has, which is why it is taken daily.',
    nominal: [48, 82],
    watch: [42, 95],
    action: {
      nominal: 'Within your own baseline band. Log and continue.',
      watch: 'Check hydration and sleep log. Retake tomorrow before rising.',
      caution: 'Retake after ten minutes seated. If it holds, notify the flight surgeon.',
    },
  },
  {
    id: 'spo2',
    label: 'Blood oxygen saturation',
    short: 'SpO₂',
    unit: '%',
    min: 80,
    max: 100,
    step: 1,
    seed: 98,
    decimals: 0,
    system: 'cardiovascular',
    how: 'Fingertip pulse oximeter, hand warm and still. Wait for the trace to steady before reading.',
    why: 'A closed cabin atmosphere can drift. Saturation is the fastest check that the environment and your own gas exchange are both doing their job.',
    nominal: [95, 100],
    watch: [92, 100],
    action: {
      nominal: 'Saturation nominal. Log and continue.',
      watch: 'Confirm on the other hand and check cabin atmosphere readouts.',
      caution: 'Confirm on a second device, check cabin CO₂, and notify the flight surgeon immediately.',
    },
  },
  {
    id: 'temperature',
    label: 'Core body temperature',
    short: 'TEMP',
    unit: '°C',
    min: 34,
    max: 41,
    step: 0.1,
    seed: 36.7,
    decimals: 1,
    system: 'immune',
    how: 'Oral or tympanic, at the same time each day. Not within thirty minutes of eating, drinking or exercise.',
    why: 'Immune function is altered in flight and latent viruses can reactivate. A temperature trend is the first thing the ground will ask for.',
    nominal: [36.1, 37.3],
    watch: [35.6, 37.9],
    action: {
      nominal: 'Within the reference band. Log and continue.',
      watch: 'Retake in one hour. Log any sore throat, rash or fatigue alongside it.',
      caution: 'Retake now, begin the isolation protocol for the crew, and notify the flight surgeon.',
    },
  },
  {
    id: 'glucose',
    label: 'Blood glucose — fasting',
    short: 'GLU',
    unit: 'mg/dL',
    min: 50,
    max: 250,
    step: 1,
    seed: 88,
    decimals: 0,
    system: 'immune',
    how: 'Fasting, before the first meal of the day. Clean the site, discard the first drop, read the second.',
    why: 'Spaceflight shifts insulin sensitivity, and a closed food system narrows dietary variety. A fasting trend catches the drift early.',
    nominal: [70, 99],
    watch: [60, 125],
    action: {
      nominal: 'Fasting glucose within the reference band. Log and continue.',
      watch: 'Log the preceding meal and retest tomorrow fasting.',
      caution: 'Retest to confirm, then notify the flight surgeon with the last three days of readings.',
    },
  },
  {
    id: 'sleepHours',
    label: 'Sleep duration',
    short: 'SLEEP',
    unit: 'h',
    min: 0,
    max: 12,
    step: 0.25,
    seed: 7.1,
    decimals: 2,
    system: 'neurobehavioral',
    how: 'Total actual sleep from the wrist actigraph, not time in the sleep station.',
    why: 'A 90-minute orbital day, constant noise and a fixed timeline all erode sleep. Debt accumulates silently and shows up as error rate before it shows up as tiredness.',
    nominal: [7, 9],
    watch: [6, 10],
    action: {
      nominal: 'Sleep within the crew target. Log and continue.',
      watch: 'Protect the next sleep period. Move non-critical tasks out of the pre-sleep hour.',
      caution: 'Flag to the ground for timeline relief. Sustained debt is treated as an operational risk, not a personal one.',
    },
  },
  {
    id: 'mood',
    label: 'Mood and workload self-report',
    short: 'MOOD',
    unit: '/10',
    min: 1,
    max: 10,
    step: 1,
    seed: 7,
    decimals: 0,
    system: 'neurobehavioral',
    how: 'One number for how you are doing today, taken honestly rather than optimistically. Ten is best.',
    why: 'Isolation, confinement and distance from Earth are hazards in their own right. A self-report trend is how behavioural health is tracked when there is no one else to notice.',
    nominal: [6, 10],
    watch: [4, 10],
    action: {
      nominal: 'Self-report in band. Log and continue.',
      watch: 'Use a private crew conference slot this week. Log what changed.',
      caution: 'Request a private medical conference on the next pass. This is a routine request, not an escalation against you.',
    },
  },
]

export const CHECK_BY_ID = Object.fromEntries(CHECKS.map((c) => [c.id, c])) as Record<CheckId, CheckDef>

/** Which band a value falls in. Bands are inclusive of their bounds. */
export function bandFor(def: CheckDef, value: number): Band {
  if (value >= def.nominal[0] && value <= def.nominal[1]) return 'nominal'
  if (value >= def.watch[0] && value <= def.watch[1]) return 'watch'
  return 'caution'
}

/** A reading the crew member entered themselves. */
export interface Reading {
  id: CheckId
  value: number
  day: number
  at: number
  /** The crew member the reading was taken for. */
  astronautId?: string
}
