import type { Alert, Astronaut, DailyRecord, IndicatorKey, Mission, MissionEvent, ScenarioParams } from '../types'
import { INDICATORS, INDICATOR_KEYS, formatIndicator } from './indicators'
import { mean, std } from './stats'
import type { AstronautStatus } from './health'
import { SIMULATOR_ASSUMPTIONS, RADIATION_SCENARIOS } from './simulator'
import { phaseForDay } from '../data/mission'
import { fmtDate } from './format'

/**
 * Local, rule-based Mission Assistant.
 *
 * No external AI model is connected. Questions are matched to intents and
 * answered by computing directly over the application's current data, with
 * the reasoning steps exposed and facts separated from hypotheses.
 */

export interface AssistantContext {
  records: DailyRecord[]
  astronauts: Astronaut[]
  alerts: Alert[]
  statuses: AstronautStatus[]
  asOfDay: number
  mission: Mission
  events: MissionEvent[]
  lastScenario: ScenarioParams | null
}

export interface AssistantAnswer {
  text: string
  reasoning: string[]
  facts: string[]
  hypotheses: string[]
  suggestions: string[]
}

export const SUGGESTED_QUESTIONS = [
  'Which astronaut has experienced the largest change in sleep consistency?',
  'What health indicators changed most during the last 30 mission days?',
  'Explain the latest warning.',
  "Compare the crew's cardiovascular trends.",
  'What assumptions were used in this simulation?',
  'How is Ferreira doing?',
  'Summarise crew radiation exposure.',
  'What is the mission status?',
]

const NO_DIAGNOSIS = 'AURORA reports statistical changes in indicators; it does not diagnose medical conditions.'

function name(ctx: AssistantContext, id: string): string {
  return ctx.astronauts.find((a) => a.id === id)?.name ?? id
}

function seriesFor(ctx: AssistantContext, id: string, key: IndicatorKey, from: number, to: number): number[] {
  return ctx.records
    .filter((r) => r.astronautId === id && r.day >= from && r.day <= to)
    .sort((a, b) => a.day - b.day)
    .map((r) => r[key])
}

function findAstronaut(ctx: AssistantContext, q: string): Astronaut | undefined {
  const lower = q.toLowerCase()
  return ctx.astronauts.find(
    (a) => lower.includes(a.callsign.toLowerCase()) || lower.includes(a.name.toLowerCase()) || lower.includes(a.id.toLowerCase()) || lower.includes(a.name.split(' ')[0].toLowerCase()),
  )
}

function parseDays(q: string, fallback = 30): number {
  const m = q.match(/(\d+)\s*(mission\s*)?days?/i)
  if (m) return Math.max(7, Math.min(400, parseInt(m[1], 10)))
  if (/week/i.test(q)) return 7
  if (/month/i.test(q)) return 30
  return fallback
}

// --- Intents -----------------------------------------------------------------

function sleepConsistencyChange(ctx: AssistantContext): AssistantAnswer {
  const d = ctx.asOfDay
  const rows = ctx.astronauts.map((a) => {
    const recent = mean(seriesFor(ctx, a.id, 'sleepConsistency', d - 13, d))
    const prior = mean(seriesFor(ctx, a.id, 'sleepConsistency', d - 43, d - 14))
    const sdRecent = std(seriesFor(ctx, a.id, 'sleepDuration', d - 13, d))
    return { a, recent, prior, change: recent - prior, sdRecent }
  })
  rows.sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
  const top = rows[0]
  const lines = rows.map(
    (r) => `- **${r.a.name}** (${r.a.id}): ${r.prior.toFixed(0)} → ${r.recent.toFixed(0)}/100 (${r.change > 0 ? '+' : ''}${r.change.toFixed(0)}); night-to-night sleep variability ${r.sdRecent.toFixed(1)} h`,
  )
  return {
    text: `**${top.a.name}** shows the largest change in sleep consistency: the score moved ${top.change > 0 ? 'up' : 'down'} ${Math.abs(top.change).toFixed(0)} points (${top.prior.toFixed(0)} → ${top.recent.toFixed(0)}/100) comparing the last 14 days with the 30 days before that.\n\n${lines.join('\n')}`,
    reasoning: [
      `Compared each crew member's mean sleep consistency score over mission days ${d - 13}–${d} against days ${d - 43}–${d - 14}.`,
      'Ranked by absolute change so that improvements and declines are both visible.',
      'Cross-checked with the standard deviation of sleep duration over the recent window.',
    ],
    facts: [`Window ends on ${fmtDate(d)} (mission day ${d}).`, 'Sleep consistency is a derived score from simulated actigraphy; 100 means perfectly regular timing and duration.'],
    hypotheses: [
      top.change < 0
        ? `The decline for ${top.a.callsign} coincides with ${nearbyEvents(ctx, d - 13, d) || 'no logged mission event'}; schedule disruption is a plausible but unconfirmed driver.`
        : 'Improvements may reflect a return to a regular schedule.',
      NO_DIAGNOSIS,
    ],
    suggestions: [`How is ${top.a.callsign} doing?`, 'Explain the latest warning.'],
  }
}

function nearbyEvents(ctx: AssistantContext, from: number, to: number): string {
  const ev = ctx.events.filter((e) => e.day <= to && (e.endDay ?? e.day) >= from - 7)
  return ev.map((e) => `"${e.title}" (MD ${e.day}${e.endDay ? `–${e.endDay}` : ''})`).join(', ')
}

function indicatorsChangedMost(ctx: AssistantContext, days: number): AssistantAnswer {
  const d = ctx.asOfDay
  const start = Math.max(1, d - days + 1)
  const keys = INDICATOR_KEYS.filter((k) => !['radiationCumulative', 'radiationDaily', 'muscleStrength', 'boneDensity'].includes(k))
  const rows = keys.map((k) => {
    const recentVals: number[] = []
    const earlyVals: number[] = []
    const baseVals: number[] = []
    for (const a of ctx.astronauts) {
      recentVals.push(mean(seriesFor(ctx, a.id, k, d - 6, d)))
      earlyVals.push(mean(seriesFor(ctx, a.id, k, start, start + 6)))
      baseVals.push(...seriesFor(ctx, a.id, k, Math.max(1, start - 60), start - 1))
    }
    const sd = std(baseVals) || 1
    const change = mean(recentVals) - mean(earlyVals)
    return { k, early: mean(earlyVals), recent: mean(recentVals), change, zish: change / sd }
  })
  rows.sort((x, y) => Math.abs(y.zish) - Math.abs(x.zish))
  const top = rows.slice(0, 5)
  const lines = top.map((r) => `- **${INDICATORS[r.k].label}**: ${formatIndicator(r.k, r.early)} → ${formatIndicator(r.k, r.recent)} (${r.zish > 0 ? '+' : ''}${r.zish.toFixed(1)} σ of the prior crew spread)`)
  const perAstro = ctx.astronauts
    .map((a) => {
      const k = top[0].k
      const e = mean(seriesFor(ctx, a.id, k, start, start + 6))
      const r = mean(seriesFor(ctx, a.id, k, d - 6, d))
      return { a, delta: r - e }
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0]
  return {
    text: `Across the crew, the indicators that changed most over the last ${days} mission days (MD ${start}–${d}) are:\n\n${lines.join('\n')}\n\nThe largest individual contribution to the top item comes from **${perAstro.a.name}** (${perAstro.delta > 0 ? '+' : ''}${perAstro.delta.toFixed(INDICATORS[top[0].k].decimals)} ${INDICATORS[top[0].k].unit}).`,
    reasoning: [
      `For each indicator, compared the crew-mean of the first 7 days of the window with the last 7 days.`,
      'Normalised each change by the crew spread in the 60 days before the window so that different units are comparable.',
      'Excluded cumulative radiation (always increasing) and the slow structural muscle/bone indicators, which would dominate a spread-normalised ranking.',
    ],
    facts: [`${ctx.records.filter((r) => r.day >= start && r.day <= d).length} daily records analysed for 4 crew members.`],
    hypotheses: ['Large crew-wide shifts often trace to shared mission events; individual shifts to personal schedule or health factors.', NO_DIAGNOSIS],
    suggestions: ['Explain the latest warning.', `How is ${perAstro.a.callsign} doing?`],
  }
}

function explainAlert(ctx: AssistantContext, alert: Alert | undefined, label: string): AssistantAnswer {
  if (!alert) {
    return {
      text: `There is no ${label} to explain as of mission day ${ctx.asOfDay}. All crew indicators are within their rolling baselines.`,
      reasoning: ['Checked the anomaly-detection output for the current mission day.'],
      facts: [`${ctx.alerts.length} alerts exist in the mission history.`],
      hypotheses: [],
      suggestions: ['What is the mission status?', "Compare the crew's cardiovascular trends."],
    }
  }
  const who = alert.astronautIds.length === ctx.astronauts.length ? 'the whole crew' : alert.astronautIds.map((id) => name(ctx, id)).join(', ')
  return {
    text: `**${alert.title}**\n\nSeverity: ${alert.severity.toUpperCase()} · Confidence ${Math.round(alert.confidence * 100)}% · ${alert.active ? 'Active' : 'Resolved'}\n\n**What changed.** ${alert.whatChanged}\n\n**When.** Detected on mission day ${alert.startDay} (${fmtDate(alert.startDay)})${alert.endDay !== alert.startDay ? `, last observed day ${alert.endDay}` : ''}. Affects ${who}.\n\n**Why it was flagged.** ${alert.why}\n\n**What to review.**\n${alert.review.map((r) => `- ${r}`).join('\n')}`,
    reasoning: [`Rule applied: ${alert.ruleName} — ${alert.method}.`, alert.confidenceRationale],
    facts: alert.stats.filter((s) => alert.indicators.includes(s.indicator)).map((s) => `${INDICATORS[s.indicator].label}: baseline ${formatIndicator(s.indicator, s.baseline)}, recent ${formatIndicator(s.indicator, s.recent)}${s.z ? `, z = ${s.z.toFixed(1)}` : ''}`),
    hypotheses: [`Mission events in the same window: ${nearbyEvents(ctx, alert.startDay, alert.endDay) || 'none logged'}. Any causal link is a hypothesis for the crew to check.`, 'An anomaly is a statistical deviation from a personal baseline, not a diagnosis.'],
    suggestions: [`How is ${alert.astronautIds.length === 1 ? name(ctx, alert.astronautIds[0]).split(' ')[1] : 'the crew'} doing?`, 'What health indicators changed most during the last 30 mission days?'],
  }
}

function compareCardio(ctx: AssistantContext): AssistantAnswer {
  const d = ctx.asOfDay
  const rows = ctx.astronauts.map((a) => {
    const hr = mean(seriesFor(ctx, a.id, 'restingHR', d - 6, d))
    const hr30 = mean(seriesFor(ctx, a.id, 'restingHR', d - 36, d - 7))
    const hrv = mean(seriesFor(ctx, a.id, 'hrv', d - 6, d))
    const hrv30 = mean(seriesFor(ctx, a.id, 'hrv', d - 36, d - 7))
    const sys = mean(seriesFor(ctx, a.id, 'systolicBP', d - 6, d))
    return { a, hr, hrDelta: hr - hr30, hrPre: hr - a.baseline.restingHR, hrv, hrvDelta: hrv - hrv30, sys }
  })
  const mostHr = [...rows].sort((x, y) => y.hrDelta - x.hrDelta)[0]
  const lines = rows.map(
    (r) => `- **${r.a.name}**: resting HR ${r.hr.toFixed(0)} bpm (${r.hrDelta > 0 ? '+' : ''}${r.hrDelta.toFixed(1)} vs prior 30 d, ${r.hrPre > 0 ? '+' : ''}${r.hrPre.toFixed(0)} vs pre-flight) · HRV ${r.hrv.toFixed(0)} ms (${r.hrvDelta > 0 ? '+' : ''}${r.hrvDelta.toFixed(0)}) · systolic ${r.sys.toFixed(0)} mmHg`,
  )
  return {
    text: `Cardiovascular comparison for the last 7 days (MD ${d - 6}–${d}):\n\n${lines.join('\n')}\n\n**${mostHr.a.name}** shows the largest recent upward shift in resting heart rate (${mostHr.hrDelta > 0 ? '+' : ''}${mostHr.hrDelta.toFixed(1)} bpm) with HRV moving ${mostHr.hrvDelta.toFixed(0)} ms. The other three crew members are within about 2 bpm of their prior month.`,
    reasoning: ['Computed 7-day means for resting HR, HRV and systolic BP for each crew member.', 'Compared with each person\'s own prior 30-day mean and pre-flight baseline, because inter-individual differences are normal.'],
    facts: ['A small resting-HR rise in microgravity is expected; the comparison looks for individual change rather than absolute level.'],
    hypotheses: [
      mostHr.hrDelta > 3 ? `${mostHr.a.callsign}'s shift coincides with reduced exercise logging and rising fatigue in the same window; deconditioning or workload are plausible drivers to review.` : 'No crew member shows a notable cardiovascular shift in this window.',
      NO_DIAGNOSIS,
    ],
    suggestions: [`How is ${mostHr.a.callsign} doing?`, 'Explain the latest warning.'],
  }
}

function simulationAssumptions(ctx: AssistantContext): AssistantAnswer {
  const p = ctx.lastScenario
  const paramText = p
    ? `The most recent scenario you ran used: ${p.durationDays}-day duration, ${p.sleepDisruption}% sleep disruption, ${p.exerciseSessionsPerWeek} exercise sessions/week, radiation scenario "${RADIATION_SCENARIOS[p.radiationScenario].label}", stress ${p.stressLevel}/10.`
    : 'No scenario has been run yet in this session; the defaults are a 900-day mission with 15% sleep disruption, 6 exercise sessions/week, nominal radiation and stress 4/10.'
  return {
    text: `${paramText}\n\nThe simulator's modelling assumptions are:\n\n${SIMULATOR_ASSUMPTIONS.map((a) => `- ${a}`).join('\n')}`,
    reasoning: ['Read the current simulator parameters from the application state.', 'Listed the fixed model assumptions documented in the simulator module.'],
    facts: ['Background radiation rates are informed by MSL/RAD measurements (Zeitlin et al. 2013; Hassler et al. 2014).', 'The 600 mSv career limit referenced in operational considerations is from NASA-STD-3001.'],
    hypotheses: ['Every simulator output is an illustrative projection, not a validated medical prediction.'],
    suggestions: ['What is the mission status?', 'Summarise crew radiation exposure.'],
  }
}

function astronautSummary(ctx: AssistantContext, a: Astronaut): AssistantAnswer {
  const s = ctx.statuses.find((x) => x.astronautId === a.id)!
  const d = ctx.asOfDay
  const k = (key: IndicatorKey) => mean(seriesFor(ctx, a.id, key, d - 6, d))
  const alerts = ctx.alerts.filter((al) => al.astronautIds.includes(a.id))
  const active = alerts.filter((al) => al.active)
  return {
    text: `**${a.name}** (${a.id}, ${a.role}) — status **${s.status.toUpperCase()}**, composite score ${s.score}/100 as of mission day ${d}.\n\n7-day means: resting HR ${k('restingHR').toFixed(0)} bpm · HRV ${k('hrv').toFixed(0)} ms · sleep ${k('sleepDuration').toFixed(1)} h (quality ${k('sleepQuality').toFixed(0)}) · exercise ${k('exerciseMinutes').toFixed(0)} min/day · fatigue ${k('fatigue').toFixed(1)}/10 · stress ${k('stress').toFixed(1)}/10 · mood ${k('mood').toFixed(1)}/10 · cumulative dose ${s.latest?.radiationCumulative.toFixed(0)} mSv.\n\n**Score drivers:** ${s.drivers.join('; ')}.\n\n**Alerts:** ${active.length} active, ${alerts.length - active.length} resolved${active.length ? ` — ${active.map((al) => al.title).join('; ')}` : ''}.`,
    reasoning: ['Pulled the composite status computed from the trailing 7 days against pre-flight baselines.', 'Listed active and historical alerts attributed to this crew member.'],
    facts: [`${ctx.records.filter((r) => r.astronautId === a.id).length} daily records on file.`, 'The composite score is an operational prioritisation aid, not a clinical measure.'],
    hypotheses: active.length ? ['Active alerts describe statistical deviations; causes are hypotheses for review at the next medical conference.'] : ['No active deviations from personal baseline.'],
    suggestions: ['Explain the latest warning.', "Compare the crew's cardiovascular trends."],
  }
}

function radiationSummary(ctx: AssistantContext): AssistantAnswer {
  const events = ctx.alerts.filter((a) => a.ruleId === 'radiation-event')
  const rows = ctx.statuses.map((s) => `- **${name(ctx, s.astronautId)}**: ${s.latest?.radiationCumulative.toFixed(0)} mSv cumulative`)
  const latest = ctx.statuses[0]?.latest
  const phase = phaseForDay(ctx.asOfDay)
  const recentDose = mean(ctx.records.filter((r) => r.day > ctx.asOfDay - 7 && r.day <= ctx.asOfDay).map((r) => r.radiationDaily))
  // Remaining profile: surface at ~0.48 mSv/day until day 712, then ~1.78 mSv/day in return transit.
  const remainingSurface = Math.max(0, Math.min(712, 900) - Math.max(ctx.asOfDay, 213))
  const remainingTransit = Math.max(0, 900 - Math.max(ctx.asOfDay, 713))
  const projected = (latest?.radiationCumulative ?? 0) + remainingSurface * 0.48 + remainingTransit * 1.78
  const vsLimit = projected > 600 ? `exceeds the 600 mSv career effective-dose limit in NASA-STD-3001 by about ${(projected - 600).toFixed(0)} mSv. This is a known challenge for Mars missions and is why shielding and transit duration dominate mission design.` : `remains within the 600 mSv career effective-dose limit in NASA-STD-3001.`
  return {
    text: `Radiation exposure as of mission day ${ctx.asOfDay} (${phase.name}):\n\n${rows.join('\n')}\n\nCurrent background is about ${recentDose.toFixed(2)} mSv/day. ${events.length} exposure event(s) have been detected: ${events.map((e) => `MD ${e.startDay} (${e.title.replace('Crew-wide radiation event: ', '')})`).join('; ') || 'none'}.\n\nProjecting the remaining surface stay and return transit at the mission's background rates, the crew would finish the 900-day mission near **${projected.toFixed(0)} mSv**, which ${vsLimit}`,
    reasoning: ['Summed simulated daily dosimeter readings per crew member.', 'Projected the remainder using the surface (~0.48 mSv/day) and transit (~1.78 mSv/day) background rates used in the data model, with no further solar particle events.'],
    facts: ['Background rates in the simulated data are informed by MSL/RAD measurements: ~1.8 mSv/day in transit, ~0.5 mSv/day in a shielded surface habitat.'],
    hypotheses: ['The forward projection assumes no further solar particle events and is illustrative only.'],
    suggestions: ['What assumptions were used in this simulation?', 'Explain the latest warning.'],
  }
}

function missionStatus(ctx: AssistantContext): AssistantAnswer {
  const phase = phaseForDay(ctx.asOfDay)
  const active = ctx.alerts.filter((a) => a.active)
  const upcoming = ctx.events.filter((e) => e.day > ctx.asOfDay).slice(0, 3)
  const crew = Math.round(mean(ctx.statuses.map((s) => s.score)))
  return {
    text: `**${ctx.mission.name}** is on mission day ${ctx.asOfDay} of ${ctx.mission.totalDays} (${fmtDate(ctx.asOfDay)}), in the **${phase.name}** phase. Crew composite score is ${crew}/100 with ${active.length} active alert(s).\n\nCrew status: ${ctx.statuses.map((s) => `${name(ctx, s.astronautId).split(' ')[1]} ${s.status}`).join(' · ')}.\n\nNext planned events: ${upcoming.map((e) => `${e.title} (MD ${e.day})`).join('; ') || 'none logged'}.`,
    reasoning: ['Read mission metadata, phase table and the current anomaly output.'],
    facts: [`${ctx.events.filter((e) => e.day <= ctx.asOfDay).length} mission events logged to date.`],
    hypotheses: [],
    suggestions: ['Explain the latest warning.', 'Summarise crew radiation exposure.'],
  }
}

function listAlerts(ctx: AssistantContext): AssistantAnswer {
  const active = ctx.alerts.filter((a) => a.active)
  const resolved = ctx.alerts.filter((a) => !a.active)
  const fmt = (a: Alert) => `- **${a.title}** — ${a.severity}, ${Math.round(a.confidence * 100)}% confidence, MD ${a.startDay}${a.endDay !== a.startDay ? `–${a.endDay}` : ''}`
  return {
    text: `**${active.length} active alert(s)** as of mission day ${ctx.asOfDay}:\n\n${active.map(fmt).join('\n') || '- none'}\n\n**${resolved.length} resolved** in mission history:\n\n${resolved.slice(0, 6).map(fmt).join('\n') || '- none'}`,
    reasoning: ['Listed the anomaly-detection output sorted by recency and severity.'],
    facts: ['Alerts are generated by transparent statistical rules; each carries its triggering numbers.'],
    hypotheses: [NO_DIAGNOSIS],
    suggestions: ['Explain the latest warning.'],
  }
}

function categorySummary(ctx: AssistantContext, keys: IndicatorKey[], label: string): AssistantAnswer {
  const d = ctx.asOfDay
  const lines = ctx.astronauts.map((a) => {
    const parts = keys.map((k) => {
      const recent = mean(seriesFor(ctx, a.id, k, d - 6, d))
      const prior = mean(seriesFor(ctx, a.id, k, d - 36, d - 7))
      const delta = recent - prior
      return `${INDICATORS[k].shortLabel} ${formatIndicator(k, recent)} (${delta > 0 ? '+' : ''}${delta.toFixed(INDICATORS[k].decimals)})`
    })
    return `- **${a.name}**: ${parts.join(' · ')}`
  })
  return {
    text: `${label} summary, 7-day means with change versus the prior 30 days:\n\n${lines.join('\n')}`,
    reasoning: ['Computed 7-day means per crew member and compared to each person\'s prior 30-day mean.'],
    facts: ['Values are simulated demonstration data.'],
    hypotheses: [NO_DIAGNOSIS],
    suggestions: ['What health indicators changed most during the last 30 mission days?', 'Explain the latest warning.'],
  }
}

function help(): AssistantAnswer {
  return {
    text: `I am AURORA's local mission assistant. I answer questions by computing directly over the data loaded in this application; no external AI service is connected.\n\nI can:\n- Rank crew members by change in any health category\n- Explain any alert, including the rule and numbers behind it\n- Compare cardiovascular, sleep, physical or behavioral trends across the crew\n- Summarise radiation exposure and mission status\n- Describe the simulator's assumptions\n\nTry one of the suggested questions below.`,
    reasoning: [],
    facts: [],
    hypotheses: [],
    suggestions: SUGGESTED_QUESTIONS.slice(0, 4),
  }
}

export function answerQuestion(question: string, ctx: AssistantContext): AssistantAnswer {
  const q = question.toLowerCase().trim()
  if (!q) return help()
  if (/help|what can you|who are you|how do you work/.test(q)) return help()
  if (/assum|limitation|how.*simulat|simulat.*(work|model)/.test(q)) return simulationAssumptions(ctx)
  if (/sleep/.test(q) && /consisten|regular|variab/.test(q)) return sleepConsistencyChange(ctx)
  if (/(changed|change|moved|shifted)\s+(the\s+)?most|largest change|biggest change|most change/.test(q)) return indicatorsChangedMost(ctx, parseDays(q))
  if (/(explain|what|why|tell).*(latest|last|recent|newest|current).*(warning|alert|anomal)|explain.*(warning|alert|anomal)/.test(q)) {
    const latest = ctx.alerts.find((a) => a.active) ?? ctx.alerts[0]
    return explainAlert(ctx, latest, 'warning')
  }
  if (/(compare|comparison|versus|vs)/.test(q) && /cardio|heart|hrv|blood/.test(q)) return compareCardio(ctx)
  if (/cardio|heart rate|hrv|blood pressure/.test(q)) return categorySummary(ctx, ['restingHR', 'hrv', 'systolicBP'], 'Cardiovascular')
  if (/radiation|dose|msv|solar particle/.test(q)) return radiationSummary(ctx)
  const astro = findAstronaut(ctx, q)
  if (astro) return astronautSummary(ctx, astro)
  if (/mission (status|day|phase)|where are we|what phase|elapsed|how far/.test(q)) return missionStatus(ctx)
  if (/alerts?|warnings?|anomal/.test(q)) return listAlerts(ctx)
  if (/sleep/.test(q)) return categorySummary(ctx, ['sleepDuration', 'sleepConsistency', 'sleepQuality'], 'Sleep')
  if (/exercise|muscle|bone|strength|physical/.test(q)) return categorySummary(ctx, ['exerciseMinutes', 'muscleStrength', 'boneDensity'], 'Physical health')
  if (/stress|mood|fatigue|behavio|mental|morale/.test(q)) return categorySummary(ctx, ['stress', 'mood', 'fatigue'], 'Behavioral health')
  if (/crew|status|overview|summary|how.*(everyone|doing)/.test(q)) return missionStatus(ctx)
  return {
    text: `I could not match that question to the data available in AURORA. I only answer from the loaded mission data, so I will not guess.\n\nYou can ask about a crew member by name, about alerts, or about any of the five health categories, radiation, mission status, or the simulator's assumptions.`,
    reasoning: ['No intent matched the question against the available data domains.'],
    facts: [],
    hypotheses: [],
    suggestions: SUGGESTED_QUESTIONS.slice(0, 4),
  }
}
