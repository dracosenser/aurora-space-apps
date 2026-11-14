import type { Alert, Astronaut, DailyRecord, IndicatorKey } from '../types'
import { clamp, mean, slope } from './stats'

export type HealthStatus = 'nominal' | 'watch' | 'caution'

export interface AstronautStatus {
  astronautId: string
  score: number
  status: HealthStatus
  latest: DailyRecord | null
  recent: DailyRecord[]
  activeAlerts: Alert[]
  drivers: string[]
}

export function statusFromScore(score: number): HealthStatus {
  if (score >= 80) return 'nominal'
  if (score >= 65) return 'watch'
  return 'caution'
}

/**
 * Composite 0-100 "status" score for the trailing 7 days. This is an
 * operational summary for prioritising review, not a clinical score.
 */
export function computeStatus(astro: Astronaut, records: DailyRecord[], alerts: Alert[], asOfDay: number): AstronautStatus {
  const mine = records.filter((r) => r.astronautId === astro.id && r.day <= asOfDay).sort((a, b) => a.day - b.day)
  const recent = mine.slice(-7)
  const latest = mine.length ? mine[mine.length - 1] : null
  const activeAlerts = alerts.filter((a) => a.active && a.astronautIds.includes(astro.id))
  if (recent.length === 0) {
    return { astronautId: astro.id, score: 0, status: 'caution', latest, recent, activeAlerts, drivers: ['No data available'] }
  }
  const b = astro.baseline
  const m = (k: IndicatorKey) => mean(recent.map((r) => r[k]))
  const drivers: string[] = []
  let penalty = 0

  const hrDelta = m('restingHR') - b.restingHR
  if (hrDelta > 2.5) {
    penalty += Math.min(14, (hrDelta - 2.5) * 2)
    drivers.push(`Resting HR +${hrDelta.toFixed(0)} bpm vs pre-flight`)
  }
  const hrvDelta = b.hrv - m('hrv')
  if (hrvDelta > 6) {
    penalty += Math.min(10, (hrvDelta - 6) * 0.8)
    drivers.push(`HRV −${hrvDelta.toFixed(0)} ms vs pre-flight`)
  }
  const sleep = m('sleepDuration')
  if (sleep < 6.5) {
    penalty += Math.min(14, (6.5 - sleep) * 10)
    drivers.push(`Sleep averaging ${sleep.toFixed(1)} h`)
  }
  const sq = m('sleepQuality')
  if (sq < 72) {
    penalty += Math.min(8, (72 - sq) * 0.5)
    drivers.push(`Sleep quality ${sq.toFixed(0)}/100`)
  }
  const sc = m('sleepConsistency')
  if (sc < 70) {
    penalty += Math.min(8, (70 - sc) * 0.4)
    drivers.push(`Sleep consistency ${sc.toFixed(0)}/100`)
  }
  const exRatio = m('exerciseMinutes') / b.exerciseMinutes
  if (exRatio < 0.9) {
    penalty += Math.min(14, (0.9 - exRatio) * 60)
    drivers.push(`Exercise at ${Math.round(exRatio * 100)}% of baseline`)
  }
  const fatigue = m('fatigue')
  if (fatigue > 4.5) {
    penalty += Math.min(12, (fatigue - 4.5) * 4)
    drivers.push(`Fatigue ${fatigue.toFixed(1)}/10`)
  }
  const stress = m('stress')
  if (stress > 5.5) {
    penalty += Math.min(10, (stress - 5.5) * 3)
    drivers.push(`Stress ${stress.toFixed(1)}/10`)
  }
  const mood = m('mood')
  if (mood < 5.5) {
    penalty += Math.min(8, (5.5 - mood) * 3)
    drivers.push(`Mood ${mood.toFixed(1)}/10`)
  }
  let score = clamp(100 - penalty, 0, 100)
  if (activeAlerts.some((a) => a.severity === 'caution')) score = Math.min(score, 72)
  else if (activeAlerts.some((a) => a.severity === 'watch')) score = Math.min(score, 84)
  score = Math.round(score)
  if (drivers.length === 0) drivers.push('All tracked indicators within personal baseline ranges')
  return { astronautId: astro.id, score, status: statusFromScore(score), latest, recent, activeAlerts, drivers }
}

export function crewScore(statuses: AstronautStatus[]): number {
  if (statuses.length === 0) return 0
  return Math.round(mean(statuses.map((s) => s.score)))
}

/** Trend of an indicator over the given window, expressed per 30 days. */
export function trendPer30(records: DailyRecord[], key: IndicatorKey, fromDay: number, toDay: number): number {
  const vals = records.filter((r) => r.day >= fromDay && r.day <= toDay).sort((a, b) => a.day - b.day).map((r) => r[key])
  return slope(vals) * 30
}
