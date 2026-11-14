import type { Alert, Astronaut, DailyRecord, Mission, MissionEvent } from '../types'
import type { AstronautStatus } from './health'
import { phaseForDay } from '../data/mission'
import { fmtDate } from './format'
import { INDICATORS, formatIndicator } from './indicators'
import { mean } from './stats'

export interface ReportInput {
  mission: Mission
  asOfDay: number
  astronauts: Astronaut[]
  statuses: AstronautStatus[]
  alerts: Alert[]
  records: DailyRecord[]
  events: MissionEvent[]
}

export function buildReport(input: ReportInput): string {
  const { mission, asOfDay, astronauts, statuses, alerts, records, events } = input
  const phase = phaseForDay(asOfDay)
  const lines: string[] = []
  lines.push(`# AURORA Mission Health Report — ${mission.name}`)
  lines.push('')
  lines.push(`Generated ${new Date().toISOString()} · Mission day ${asOfDay} of ${mission.totalDays} (${fmtDate(asOfDay)}) · Phase: ${phase.name}`)
  lines.push('')
  lines.push('> SIMULATED DEMONSTRATION DATA. All crew members, values and events are fictional. Alerts are statistical deviations from personal baselines, not medical diagnoses.')
  lines.push('')
  lines.push('## Crew status')
  lines.push('')
  lines.push('| Crew member | Role | Status | Score | Key drivers |')
  lines.push('|---|---|---|---|---|')
  for (const s of statuses) {
    const a = astronauts.find((x) => x.id === s.astronautId)!
    lines.push(`| ${a.name} (${a.id}) | ${a.role} | ${s.status.toUpperCase()} | ${s.score}/100 | ${s.drivers.join('; ')} |`)
  }
  lines.push('')
  lines.push('## 7-day indicator summary')
  lines.push('')
  const keys = ['restingHR', 'hrv', 'sleepDuration', 'sleepQuality', 'exerciseMinutes', 'muscleStrength', 'boneDensity', 'radiationCumulative', 'fatigue', 'stress', 'mood'] as const
  lines.push(`| Indicator | ${astronauts.map((a) => a.callsign).join(' | ')} |`)
  lines.push(`|---|${astronauts.map(() => '---').join('|')}|`)
  for (const k of keys) {
    const cells = astronauts.map((a) => {
      const vals = records.filter((r) => r.astronautId === a.id && r.day > asOfDay - 7 && r.day <= asOfDay).map((r) => r[k])
      return k === 'radiationCumulative' ? formatIndicator(k, Math.max(...vals)) : formatIndicator(k, mean(vals))
    })
    lines.push(`| ${INDICATORS[k].label} | ${cells.join(' | ')} |`)
  }
  lines.push('')
  lines.push('## Active alerts')
  lines.push('')
  const active = alerts.filter((a) => a.active)
  if (active.length === 0) lines.push('No active alerts.')
  for (const a of active) {
    lines.push(`### ${a.title}`)
    lines.push(`- Severity: ${a.severity} · Confidence: ${Math.round(a.confidence * 100)}% · Detected MD ${a.startDay} (${fmtDate(a.startDay)})`)
    lines.push(`- Rule: ${a.ruleName} — ${a.method}`)
    lines.push(`- What changed: ${a.whatChanged}`)
    lines.push(`- Why flagged: ${a.why}`)
    lines.push(`- Review: ${a.review.join('; ')}`)
    lines.push('')
  }
  lines.push('## Resolved alerts')
  lines.push('')
  for (const a of alerts.filter((x) => !x.active)) lines.push(`- MD ${a.startDay}–${a.endDay}: ${a.title} (${a.severity}, ${Math.round(a.confidence * 100)}%)`)
  lines.push('')
  lines.push('## Mission events to date')
  lines.push('')
  for (const e of events.filter((x) => x.day <= asOfDay)) lines.push(`- MD ${e.day}${e.endDay ? `–${e.endDay}` : ''}: ${e.title} — ${e.description}`)
  lines.push('')
  lines.push('---')
  lines.push('Produced by AURORA — Autonomous Understanding of Risk, Observation & Astronaut Resilience. NASA Space Apps Challenge 2026 demonstration.')
  return lines.join('\n')
}

export function downloadText(filename: string, text: string, mime = 'text/markdown') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
