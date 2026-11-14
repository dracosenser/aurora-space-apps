import type { ScenarioPreset } from '../types'

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'nominal',
    name: 'Nominal 900-day mission',
    tagline: 'The reference plan',
    description: 'Full countermeasure schedule, mild sleep disruption, nominal radiation environment and moderate stress. Use this to understand the baseline curves.',
    params: { durationDays: 900, sleepDisruption: 15, exerciseSessionsPerWeek: 6, radiationScenario: 'nominal', stressLevel: 4 },
  },
  {
    id: 'hardware-failure',
    name: 'Exercise hardware failure',
    tagline: 'Treadmill and resistive device degraded',
    description: 'Exercise capacity falls to two sessions per week for the mission. Explores how much the countermeasure programme protects muscle and bone.',
    params: { durationDays: 900, sleepDisruption: 20, exerciseSessionsPerWeek: 2, radiationScenario: 'nominal', stressLevel: 5 },
  },
  {
    id: 'solar-storms',
    name: 'Active Sun with shelter operations',
    tagline: 'Three solar particle events and a crowded timeline',
    description: 'Three SPEs force repeated shelter protocols; the disrupted schedule raises sleep disruption and stress. Explores cumulative dose against exposure limits.',
    params: { durationDays: 900, sleepDisruption: 45, exerciseSessionsPerWeek: 5, radiationScenario: 'spe-series', stressLevel: 7 },
  },
  {
    id: 'extended-stay',
    name: 'Extended 1,100-day stay at solar minimum',
    tagline: 'Launch-window slip adds 200 days',
    description: 'A longer surface stay during solar minimum, when galactic cosmic ray background is higher. Explores radiation and deconditioning margins.',
    params: { durationDays: 1100, sleepDisruption: 25, exerciseSessionsPerWeek: 6, radiationScenario: 'solar-minimum', stressLevel: 5 },
  },
]
