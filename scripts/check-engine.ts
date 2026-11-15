/**
 * Developer check for the Constellation Engine. Runs the full pipeline on the
 * SIGNAL VEIL demonstration mission (and on one Ares crew member) and prints
 * what the engine finds. Run with: npx tsx scripts/check-engine.ts
 */
import { createMissionAnalysis } from '../src/engine'
import { generateVeilMission, VEIL_ENGINE_CONFIG } from '../src/data/veilMission'
import { datasetFromDailyRecords } from '../src/data/engineAdapters'
import { generateMissionRecords } from '../src/data/generator'
import { ASTRONAUTS } from '../src/data/astronauts'
import { EVENTS, MISSION } from '../src/data/mission'

const t0 = performance.now()
const dataset = generateVeilMission()
const analysis = createMissionAnalysis(dataset, VEIL_ENGINE_CONFIG)
console.log(`pipeline: ${(performance.now() - t0).toFixed(1)} ms`)

console.log('\n== baselines (day 60) ==')
for (const tl of analysis.timelines) {
  const b = tl.states[59].baseline
  console.log(tl.def.id.padEnd(16), b ? `${b.status} n=${b.n} med=${b.median.toFixed(2)} scale=${b.scale.toFixed(2)} phi=${b.phi.toFixed(2)} sigmaE=${b.sigmaE.toFixed(3)}` : 'none', 'rejected:', tl.rejectedDays.join(','))
}

console.log('\n== shift by day ==')
const days = [20, 40, 50, 60, 65, 70, 75, 80, 85, 90, 100, 110, 113, 120, 125, 130, 135, 140, 150]
console.log('day'.padEnd(16), days.map((d) => String(d).padStart(6)).join(''))
for (const tl of analysis.timelines) {
  console.log(tl.def.id.padEnd(16), days.map((d) => (tl.states[d - 1].shift === null ? '   n/a' : tl.states[d - 1].shift!.toFixed(1).padStart(6))).join(''))
  console.log(''.padEnd(16), days.map((d) => tl.states[d - 1].status.slice(0, 5).padStart(6)).join(''))
}
console.log('T2'.padEnd(16), days.map((d) => (analysis.joint[d - 1] ? analysis.joint[d - 1]!.t2.toFixed(0).padStart(6) : '   n/a')).join(''))
console.log('members'.padEnd(16), days.map((d) => (analysis.joint[d - 1] ? String(analysis.joint[d - 1]!.members.length).padStart(6) : '   n/a')).join(''))

console.log('\n== individual episodes ==')
for (const e of analysis.episodes) console.log(`${e.indicatorId.padEnd(16)} ${e.startDay}-${e.endDay} ${e.direction} peak ${e.peakShift.toFixed(1)} sustained=${e.sustained}`)

console.log('\n== pattern episodes ==')
for (const p of analysis.patternEpisodes) {
  console.log(`${p.id}: days ${p.startDay}-${p.endDay}, detected ${p.detectedDay}, peak T2 ${p.peakT2.toFixed(0)} on ${p.peakDay}, ${p.patternDays.length} pattern days`)
  for (const d of [p.detectedDay, 100, 120, 150]) {
    const v = analysis.patternsAt(d).find((x) => x.id === p.id)
    if (v) console.log(`  as of ${d}: ${v.stage} strength=${v.strength} core=[${v.coreMemberIds.join(', ')}] belowOwnLimit=${v.membersBelowOwnLimitAtDetection} lead=${v.leadDays} completeness=${v.completeness.toFixed(2)}`)
  }
}

console.log('\n== relationships (day 150) ==')
const t1 = performance.now()
const rel = analysis.relationshipsAt(150)
console.log(`evaluated ${rel.length} pairs in ${(performance.now() - t1).toFixed(1)} ms`)
for (const r of rel.filter((x) => x.status === 'supported')) console.log(`SUPPORTED ${r.leader} -> ${r.follower} lag ${r.lagDays} rho ${r.rho.toFixed(2)} n ${r.nPairs} neff ${r.nEffective.toFixed(0)} q ${r.qValue.toExponential(1)}`)
console.log('not established:', rel.filter((x) => x.status === 'not-established').length, 'insufficient:', rel.filter((x) => x.status === 'insufficient-data').length)
const top = rel.filter((x) => x.status === 'not-established').sort((a, b) => a.qValue - b.qValue).slice(0, 4)
for (const r of top) console.log(`  nearest miss ${r.a}~${r.b} rho ${r.rho.toFixed(2)} q ${r.qValue.toFixed(3)} reason: ${r.reason}`)
for (const d of [30, 45, 60, 90, 120]) console.log(`  day ${d}: supported ${analysis.relationshipsAt(d).filter((x) => x.status === 'supported').length}`)

console.log('\n== responses ==')
for (const a of dataset.actions) {
  for (const d of [a.day + 3, a.day + 8, a.day + 14, 150]) {
    if (d > 150) continue
    const r = analysis.responseFor(a, d)
    console.log(`[${a.id} as of ${d}] ${r.status}: ${r.summary}`)
    if (r.status !== 'awaiting-data') for (const i of r.indicators.filter((x) => x.isTarget)) console.log(`    ${i.indicatorId.padEnd(16)} ${i.classification} zPre ${i.zPre?.toFixed(2)} zPost ${i.zPost?.toFixed(2)} p ${i.pValue?.toFixed(4)} n ${i.nPre}/${i.nPost}`)
  }
}

console.log('\n== insights (day 95) ==')
for (const ins of analysis.insightsAt(95)) console.log(`${ins.id} [${ins.kind}] ${ins.title}`)
console.log('\n' + analysis.insightsAt(95)[0].narrative)

console.log('\n== Ares crew member through the same engine (rolling baseline) ==')
const records = generateMissionRecords(MISSION.currentDay)
for (const astro of ASTRONAUTS) {
  const ds = datasetFromDailyRecords(records, astro, EVENTS, MISSION.currentDay)
  const t2 = performance.now()
  const an = createMissionAnalysis(ds, { baseline: { mode: 'rolling' } })
  console.log(`${astro.name}: ${(performance.now() - t2).toFixed(0)} ms; patterns: ${an.patternEpisodes.map((p) => `${p.startDay}-${p.endDay}`).join(', ') || 'none'}`)
}
