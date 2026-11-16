import type { EnvKey, Environment, SimIndicator } from './types'

/**
 * Reference information for the simulator: environmental parameters with
 * their reference ranges and sources, the indicators produced, and the
 * registry of every modeled effect with its basis.
 *
 * Rule: a reference range is shown only with its source. Where no
 * authoritative range was confirmed, the range is labelled as a demonstration
 * setting, not a standard.
 */

export type SourceKind = 'standard' | 'literature' | 'demo-setting'

export interface EnvParamDef {
  key: EnvKey
  label: string
  unit: string
  description: string
  min: number
  max: number
  step: number
  decimals: number
  reference: { low: number | null; high: number | null; kind: SourceKind; source: string } | null
}

export const ENV_PARAMS: EnvParamDef[] = [
  {
    key: 'cabinTempC', label: 'Cabin temperature', unit: '°C', description: 'Dry-bulb air temperature in the habitable volume.', min: 5, max: 40, step: 0.1, decimals: 1,
    reference: { low: 18, high: 27, kind: 'standard', source: 'NASA-STD-3001 Vol. 2 crew-habitable temperature range (65–80 °F). Verify against the current revision.' },
  },
  {
    key: 'pressureKPa', label: 'Cabin pressure', unit: 'kPa', description: 'Total atmospheric pressure. 101.3 kPa is sea level.', min: 50, max: 110, step: 0.1, decimals: 1,
    reference: { low: null, high: null, kind: 'demo-setting', source: 'No single range applies: exploration vehicles may use reduced-pressure atmospheres. ISS operates near 101.3 kPa.' },
  },
  {
    key: 'ppO2KPa', label: 'Oxygen partial pressure', unit: 'kPa', description: 'Partial pressure of oxygen. 21.2 kPa is sea-level air.', min: 10, max: 35, step: 0.1, decimals: 1,
    reference: { low: 19.5, high: 23.1, kind: 'demo-setting', source: 'Approximate sea-level-equivalent band used in this demonstration. Not quoted from a standard.' },
  },
  {
    key: 'co2mmHg', label: 'Carbon dioxide', unit: 'mmHg', description: 'Partial pressure of CO₂ in cabin air.', min: 0, max: 20, step: 0.1, decimals: 1,
    reference: { low: null, high: 3, kind: 'literature', source: 'ISS crews reported more headaches as CO₂ rose within the 2–5 mmHg operating range (Law et al., J Occup Environ Med, 2014). 3 mmHg is used here as a reference point, not a regulatory limit.' },
  },
  {
    key: 'humidityPct', label: 'Relative humidity', unit: '%', description: 'Relative humidity of cabin air.', min: 0, max: 100, step: 1, decimals: 0,
    reference: { low: 25, high: 75, kind: 'standard', source: 'NASA-STD-3001 Vol. 2 relative humidity range. Verify against the current revision.' },
  },
  {
    key: 'radiationMSvPerDay', label: 'Radiation dose rate', unit: 'mSv/day', description: 'Background effective dose per day inside the vehicle.', min: 0, max: 10, step: 0.01, decimals: 2,
    reference: { low: null, high: null, kind: 'literature', source: 'Reference values: ~0.3–0.8 mSv/day in low Earth orbit; ~1.8 mSv/day measured in Earth–Mars cruise by MSL/RAD (Zeitlin et al., Science, 2013). Career limit 600 mSv (NASA-STD-3001 Vol. 1).' },
  },
  {
    key: 'gravityG', label: 'Gravity level', unit: 'g', description: '0 = microgravity, 0.165 = Moon, 0.38 = Mars, 1 = Earth, or artificial gravity.', min: 0, max: 1.5, step: 0.005, decimals: 3, reference: null,
  },
  {
    key: 'lightingLux', label: 'Daytime lighting', unit: 'lux', description: 'Illuminance during the work period.', min: 0, max: 2000, step: 10, decimals: 0,
    reference: { low: 100, high: null, kind: 'demo-setting', source: 'Demonstration setting. Light affects circadian timing (ISS adopted tunable LED lighting for this reason), but no threshold is quoted here.' },
  },
  {
    key: 'noiseDBA', label: 'Noise level', unit: 'dBA', description: 'Continuous background noise, 24-hour average.', min: 20, max: 100, step: 1, decimals: 0,
    reference: { low: null, high: 50, kind: 'demo-setting', source: 'Demonstration setting for sleep areas. NASA-STD-3001 Vol. 2 sets acoustic limits; consult it for the applicable values.' },
  },
  {
    key: 'vibrationMS2', label: 'Vibration', unit: 'm/s² rms', description: 'Whole-body vibration during habitable periods.', min: 0, max: 5, step: 0.01, decimals: 2,
    reference: null,
  },
  {
    key: 'particulatesUgM3', label: 'Airborne particulates', unit: 'µg/m³', description: 'Air-quality indicator: fine particle concentration.', min: 0, max: 500, step: 1, decimals: 0,
    reference: null,
  },
]

export const ENV_BY_KEY = Object.fromEntries(ENV_PARAMS.map((p) => [p.key, p])) as Record<EnvKey, EnvParamDef>

export const NOMINAL_ENVIRONMENT: Environment = {
  cabinTempC: 22.5,
  pressureKPa: 101.3,
  ppO2KPa: 21.2,
  co2mmHg: 2.5,
  humidityPct: 45,
  radiationMSvPerDay: 0.5,
  gravityG: 0,
  lightingLux: 400,
  noiseDBA: 50,
  vibrationMS2: 0.05,
  particulatesUgM3: 15,
}

export function outOfRange(key: EnvKey, value: number): 'low' | 'high' | null {
  const ref = ENV_BY_KEY[key].reference
  if (!ref) return null
  if (ref.low !== null && value < ref.low) return 'low'
  if (ref.high !== null && value > ref.high) return 'high'
  return null
}

// ---------------------------------------------------------------- indicators

export interface SimIndicatorDef {
  id: SimIndicator
  label: string
  shortLabel: string
  unit: string
  decimals: number
  category: string
  /** 'measured' would come from a sensor on a real mission; 'estimate' is a modeled proxy with no direct sensor. */
  kind: 'measured' | 'estimate'
  plausible: [number, number]
  resolution: number
}

export const SIM_INDICATORS: SimIndicatorDef[] = [
  { id: 'restingHR', label: 'Resting heart rate', shortLabel: 'Resting HR', unit: 'bpm', decimals: 0, category: 'cardiovascular', kind: 'measured', plausible: [30, 150], resolution: 1 },
  { id: 'hrv', label: 'Heart-rate variability', shortLabel: 'HRV', unit: 'ms', decimals: 0, category: 'cardiovascular', kind: 'measured', plausible: [5, 200], resolution: 1 },
  { id: 'respRate', label: 'Respiratory rate', shortLabel: 'Resp. rate', unit: '/min', decimals: 1, category: 'vitals', kind: 'measured', plausible: [6, 40], resolution: 0.1 },
  { id: 'spo2', label: 'Oxygen saturation', shortLabel: 'SpO₂', unit: '%', decimals: 1, category: 'vitals', kind: 'measured', plausible: [60, 100], resolution: 0.1 },
  { id: 'bodyTemp', label: 'Body temperature', shortLabel: 'Temp', unit: '°C', decimals: 2, category: 'vitals', kind: 'measured', plausible: [33, 42], resolution: 0.01 },
  { id: 'sleepDuration', label: 'Sleep duration', shortLabel: 'Sleep', unit: 'h', decimals: 1, category: 'sleep', kind: 'measured', plausible: [0, 14], resolution: 0.1 },
  { id: 'sleepQuality', label: 'Sleep quality index', shortLabel: 'Sleep quality', unit: '/100', decimals: 0, category: 'sleep', kind: 'estimate', plausible: [0, 100], resolution: 1 },
  { id: 'activityMinutes', label: 'Activity', shortLabel: 'Activity', unit: 'min', decimals: 0, category: 'activity', kind: 'measured', plausible: [0, 900], resolution: 1 },
  { id: 'workload', label: 'Workload index', shortLabel: 'Workload', unit: '/5', decimals: 1, category: 'behavioral', kind: 'estimate', plausible: [0, 10], resolution: 0.1 },
  { id: 'stress', label: 'Stress index', shortLabel: 'Stress', unit: '/10', decimals: 1, category: 'behavioral', kind: 'estimate', plausible: [0, 10], resolution: 0.1 },
  { id: 'fatigue', label: 'Fatigue index', shortLabel: 'Fatigue', unit: '/10', decimals: 1, category: 'behavioral', kind: 'estimate', plausible: [0, 10], resolution: 0.1 },
  { id: 'radiationDose', label: 'Daily radiation dose', shortLabel: 'Dose', unit: 'mSv', decimals: 2, category: 'radiation', kind: 'measured', plausible: [0, 500], resolution: 0.01 },
  { id: 'systolicBP', label: 'Systolic blood pressure', shortLabel: 'Systolic', unit: 'mmHg', decimals: 0, category: 'cardiovascular', kind: 'measured', plausible: [60, 220], resolution: 1 },
  { id: 'diastolicBP', label: 'Diastolic blood pressure', shortLabel: 'Diastolic', unit: 'mmHg', decimals: 0, category: 'cardiovascular', kind: 'measured', plausible: [35, 140], resolution: 1 },
  { id: 'exerciseMinutes', label: 'Exercise logged', shortLabel: 'Exercise', unit: 'min', decimals: 0, category: 'activity', kind: 'measured', plausible: [0, 400], resolution: 1 },
  { id: 'muscleStrength', label: 'Muscle strength index', shortLabel: 'Strength', unit: '% pre-flight', decimals: 1, category: 'activity', kind: 'estimate', plausible: [30, 130], resolution: 0.1 },
  { id: 'boneDensity', label: 'Bone health indicator', shortLabel: 'Bone', unit: '% pre-flight', decimals: 2, category: 'activity', kind: 'estimate', plausible: [70, 105], resolution: 0.01 },
  { id: 'mood', label: 'Mood index', shortLabel: 'Mood', unit: '/10', decimals: 1, category: 'behavioral', kind: 'estimate', plausible: [0, 10], resolution: 0.1 },
  { id: 'sleepDebt', label: 'Accumulated sleep debt', shortLabel: 'Sleep debt', unit: 'h', decimals: 1, category: 'sleep', kind: 'estimate', plausible: [0, 120], resolution: 0.1 },
  { id: 'pvtLapses', label: 'Reaction-test lapses (PVT)', shortLabel: 'PVT lapses', unit: '/test', decimals: 1, category: 'behavioral', kind: 'estimate', plausible: [0, 40], resolution: 0.1 },
  { id: 'sleepConsistency', label: 'Sleep consistency', shortLabel: 'Consistency', unit: '/100', decimals: 0, category: 'sleep', kind: 'estimate', plausible: [0, 100], resolution: 1 },
]

/**
 * Sleep model constants, each tied to a published finding.
 *
 * Van Dongen et al. (Sleep, 2003) restricted sleep to 4, 6 or 8 h for 14 days.
 * Performance lapses rose roughly linearly with the cumulative hours of sleep
 * lost and did not level off; 14 days at 6 h impaired performance about as
 * much as one night without sleep, 14 days at 4 h about as much as two. Their
 * fitted sleep need was 8.16 h. Belenky et al. (J Sleep Res, 2003) found that
 * three recovery nights did not fully restore performance after restriction.
 */
export const SLEEP_MODEL = {
  /** Default physiological need, h. Adults need 7–9 h (AASM/SRS consensus, Watson et al., Sleep, 2015). */
  defaultNeedH: 8,
  needRange: [7, 9] as [number, number],
  /** Fraction of the sleep period actually spent asleep. ISS crews slept about 6 h of an 8.5 h period (Barger et al., Lancet Neurol, 2014). */
  efficiency: 0.9,
  /** Hours of cumulative debt that impair performance about as much as one night without sleep (Van Dongen 2003). */
  nightEquivalentH: 30,
  /** Debt decays with this time constant, days (partial adaptation and recovery; an assumption). */
  decayDays: 21,
  /** Extra sleep a person takes when in debt, per hour of debt, and at most (an assumption). */
  catchUpPerHour: 0.1,
  catchUpMaxH: 2,
  maxDebtH: 90,
  /** PVT lapses per 10-minute test: well rested ≈ 2; ≈ 8.5 after one night-equivalent of debt; ≈ 15 after two (Van Dongen 2003, figure 2). */
  pvtRested: 2,
  pvtPerNight: 6.5,
}

export const SIM_INDICATOR_BY_ID = Object.fromEntries(SIM_INDICATORS.map((d) => [d.id, d])) as Record<SimIndicator, SimIndicatorDef>

// ------------------------------------------------------------ modeled effects

export type EffectBasis = 'established' | 'simplified'

export interface EffectDef {
  id: string
  label: string
  /** The relationship, in words, with its equation. */
  model: string
  basis: EffectBasis
  /** Why the relationship is included. 'simplified' effects are experimental assumptions with illustrative magnitudes. */
  source: string
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'oxygen-saturation', label: 'Oxygen supply sets saturation',
    model: 'Inspired PO₂ = ppO₂ × (Pb − 47)/Pb; alveolar PO₂ = PIO₂ − PaCO₂/0.8 with PaCO₂ = 40 mmHg; arterial PO₂ = alveolar − 10 mmHg; SpO₂ from the Severinghaus (1979) dissociation curve, applied as a change from sea-level air.',
    basis: 'established', source: 'Alveolar gas equation and Severinghaus (J Appl Physiol, 1979). Simplifications: fixed 10 mmHg A–a gradient and arterial CO₂ held at 40 mmHg, so the breathing increase that partly compensates for low oxygen is not modeled and desaturation is overstated at low oxygen.',
  },
  {
    id: 'hypoxemia-heart-rate', label: 'Lower saturation raises heart rate',
    model: 'Resting HR +0.5 bpm per 1 % SpO₂ below the sea-level reference.',
    basis: 'simplified', source: 'Heart rate rises with hypoxia (well documented qualitatively); the 0.5 bpm/% magnitude is an illustrative assumption.',
  },
  {
    id: 'sleep-opportunity', label: 'The sleep period limits sleep',
    model: 'Sleep cannot exceed 90 % of the scheduled sleep period. Shown as the difference between that cap and the person’s sleep need.',
    basis: 'established', source: 'By definition: sleep can only occur within the time allowed. ISS crews slept about 6 h in an 8.5 h period (Barger et al., Lancet Neurol, 2014); the 90 % efficiency is a round figure for a quiet cabin.',
  },
  {
    id: 'event-sleep-loss', label: 'Events shorten or extend the sleep period',
    model: 'Sleep-disruption events remove hours from the sleep period; recovery events add them.',
    basis: 'established', source: 'Accounting identity on the scheduled sleep period.',
  },
  {
    id: 'habitual-sleep', label: 'The person’s usual sleep limits sleep',
    model: 'Sleep cannot exceed the person’s usual sleep plus catch-up sleep (0.1 h per hour of debt, at most 2 h). Shown as the difference from their sleep need.',
    basis: 'simplified', source: 'People in sleep debt sleep longer when allowed (recovery sleep is documented); the catch-up rate is an assumption.',
  },
  {
    id: 'sleep-debt', label: 'Nights below sleep need accumulate as sleep debt',
    model: 'Debt(t) = Debt(t−1) × e^(−1/21) + (need − sleep), never below 0, at most 90 h. Starts from 60 pre-flight days at the person’s usual sleep.',
    basis: 'established', source: 'Cumulative sleep debt drives performance decline without levelling off over 14 days (Van Dongen et al., Sleep, 2003). The 21-day decay (partial adaptation) is an assumption.',
  },
  {
    id: 'sleep-debt-performance', label: 'Sleep debt causes reaction-time lapses, fatigue and lower mood',
    model: 'Night-equivalents N = debt ÷ 30 h. PVT lapses = 2 + 6.5 × N + 0.6 × last night’s shortfall. Fatigue +2.2 × N + 0.25 × shortfall. Mood −1.2 × N. Stress +0.6 × N.',
    basis: 'established', source: 'Lapses: Van Dongen et al. (Sleep, 2003): about 2 lapses well rested, about 8–9 after 14 days at 6 h (≈ one night without sleep), about 15 after 14 days at 4 h. Subjective sleepiness levelled off while lapses kept rising, so self-rated fatigue understates impairment. The fatigue, mood and stress slopes are assumptions.',
  },
  {
    id: 'noise-sleep', label: 'Noise reduces sleep efficiency',
    model: 'Efficiency −0.6 % per dBA above 50 dBA.',
    basis: 'simplified', source: 'Environmental noise disturbs sleep (WHO Environmental Noise Guidelines, 2018); the threshold and slope here are illustrative assumptions.',
  },
  {
    id: 'co2-sleep', label: 'Higher CO₂ reduces sleep quality',
    model: 'Efficiency −1.5 % and quality −3 points per mmHg above 3 mmHg.',
    basis: 'simplified', source: 'Law et al. (2014) associated higher ISS CO₂ with more headaches; the effect on sleep and its size are assumptions.',
  },
  {
    id: 'temperature-sleep', label: 'Cabin temperature outside 18–27 °C reduces sleep efficiency',
    model: 'Efficiency −1 % per °C outside 18–27 °C.',
    basis: 'simplified', source: 'Thermal discomfort disturbs sleep (Okamoto-Mizuno & Mizuno, J Physiol Anthropol, 2012); the slope is an assumption.',
  },
  {
    id: 'circadian-shift', label: 'Shifted schedules reduce sleep',
    model: 'Efficiency −4 % per hour of schedule shift, decaying as the crew re-entrains at about 1 hour per day.',
    basis: 'simplified', source: 'Circadian misalignment shortens sleep in spaceflight (Flynn-Evans et al., npj Microgravity, 2016); re-entrainment rate and slope are assumptions.',
  },
  {
    id: 'stress-sleep', label: 'Stress reduces sleep quality',
    model: 'Quality −2 points per stress point above 3.',
    basis: 'simplified', source: 'Illustrative assumption.',
  },
  {
    id: 'sleep-debt-cardio', label: 'Sleep debt raises heart rate and lowers HRV',
    model: 'Resting HR +1.5 bpm and HRV −6 ms per night-equivalent of sleep debt (debt ÷ 30 h).',
    basis: 'simplified', source: 'Sleep restriction raises resting heart rate and reduces HRV in laboratory studies; magnitudes here are illustrative assumptions.',
  },
  {
    id: 'deconditioning', label: 'Less exercise in reduced gravity raises resting heart rate',
    model: 'Resting HR approaches baseline + 8 bpm × (1 − exercise fraction) × (1 − g) with a 21-day time constant; HRV approaches −10 ms × the same factor.',
    basis: 'simplified', source: 'Cardiovascular deconditioning in microgravity and bed rest is documented (NASA HRP, Risk of Cardiovascular Adaptations); the magnitude and time constant are assumptions.',
  },
  {
    id: 'co2-ventilation', label: 'Higher CO₂ raises breathing rate',
    model: 'Respiratory rate +0.25 /min per mmHg above 3 mmHg.',
    basis: 'simplified', source: 'Ventilation rises with inspired CO₂ (hypercapnic ventilatory response, established); the slope here is an assumption.',
  },
  {
    id: 'thermal-body-temperature', label: 'Cabin temperature nudges body temperature',
    model: 'Body temperature ±0.05 °C per °C outside 18–27 °C.',
    basis: 'simplified', source: 'Illustrative assumption; thermoregulation normally keeps core temperature stable.',
  },
  {
    id: 'stress-cardio', label: 'Stress raises heart rate and lowers HRV',
    model: 'Resting HR +0.8 bpm and HRV −2 ms per stress point above 3.',
    basis: 'simplified', source: 'Illustrative assumption.',
  },
  {
    id: 'workload-stress', label: 'Workload and events set stress',
    model: 'Stress = 1 + 0.6 × workload + event stress increases (+ the sleep-debt term above).',
    basis: 'simplified', source: 'Illustrative assumption. Stress is a modeled index, not a measurement.',
  },
  {
    id: 'fatigue-model', label: 'Fatigue from sleep debt, stress and workload',
    model: 'Fatigue = 1.5 + 0.35 × stress + 0.2 × workload + EVA hours ÷ 6 (+ the sleep-debt terms above).',
    basis: 'simplified', source: 'Illustrative assumption. Fatigue is a modeled index, not a measurement.',
  },
  {
    id: 'activity-accounting', label: 'Activity is exercise plus EVA plus daily movement',
    model: 'Activity minutes = baseline daily movement + scheduled exercise (sessions/week × minutes ÷ 7, if equipment is available) + EVA hours × 60.',
    basis: 'established', source: 'Accounting identity: no physiological assumption.',
  },
  {
    id: 'dose-accounting', label: 'Radiation dose accumulates from background, events and EVA',
    model: 'Daily dose = background rate + solar-particle-event dose spread over its duration + EVA hours × background hourly rate × (EVA multiplier − 1).',
    basis: 'established', source: 'Accounting identity. EVA multiplier is a user setting: suits shield less than the vehicle.',
  },
  {
    id: 'muscle-deconditioning', label: 'Reduced gravity and exercise set muscle strength',
    model: 'Strength (% pre-flight) approaches 100 − 34 × (1 − g) × (1 − 0.82 × exercise fraction) at 1.2 % of the gap per day.',
    basis: 'simplified', source: 'Strength loss after long ISS missions despite exercise (Trappe et al., J Appl Physiol, 2009); equilibrium and rate are assumptions.',
  },
  {
    id: 'bone-loss', label: 'Reduced gravity and exercise set bone loss',
    model: 'Bone indicator falls 0.04 % per day × (1 − g) × (1 − 0.7 × 0.82 × exercise fraction); no in-mission recovery.',
    basis: 'simplified', source: 'Bone loss of the order of 1 %/month in weight-bearing sites, reduced by resistive exercise (Stavnichuk et al., npj Microgravity, 2020); the rate here is an assumption.',
  },
  {
    id: 'mood-model', label: 'Stress and sleep debt lower mood',
    model: 'Mood = 7.5 − 0.6 × (stress − 3, if positive) (+ the sleep-debt term above).',
    basis: 'simplified', source: 'Illustrative assumption. Mood is a modeled index, not a measurement.',
  },
  {
    id: 'exercise-log', label: 'Exercise minutes follow the schedule and equipment',
    model: 'Logged exercise = sessions/week × minutes ÷ 7 × equipment availability, with schedule changes from events.',
    basis: 'established', source: 'Accounting identity.',
  },
  {
    id: 'individual-variation', label: 'Individual day-to-day variation',
    model: 'Each indicator gets autocorrelated noise (AR(1), φ = 0.3) scaled by the astronaut’s variability setting, from a seed fixed per astronaut. Blood pressure has no modeled effect: it varies only by this noise around the baseline. Sleep consistency is derived as 92 − 26 × the standard deviation of the last 7 nights’ sleep.',
    basis: 'simplified', source: 'Represents ordinary biological and measurement variation. Same seed ⇒ same noise.',
  },
]

export const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e])) as Record<string, EffectDef>
