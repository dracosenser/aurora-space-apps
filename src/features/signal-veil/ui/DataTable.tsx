import type { MissionAnalysis } from '../../../engine/analysis'
import type { VeilSnapshot } from '../model/snapshot'
import { StatusBadge, num, signed } from './shared'

/**
 * The accessible alternative to the constellation: every value the
 * visualisation encodes, as a plain table that works with a keyboard and a
 * screen reader.
 */
export function DataTable({ analysis, snapshot, onSelect, onCompare }: { analysis: MissionAnalysis; snapshot: VeilSnapshot; onSelect: (id: string) => void; onCompare: (a: string, b: string) => void }) {
  const day = snapshot.day
  const relationships = analysis.relationshipsAt(day).filter((r) => r.status === 'supported')
  const label = (id: string) => analysis.timelineOf(id).def.label
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="eyebrow mb-2 text-left text-text-strong">Signals on mission day {day}</caption>
          <thead className="text-left text-[9px] uppercase tracking-[0.14em] text-faint">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 font-semibold">Indicator</th>
              <th scope="col" className="px-3 py-2 font-semibold">Category</th>
              <th scope="col" className="px-3 py-2 font-semibold">Latest reading</th>
              <th scope="col" className="px-3 py-2 font-semibold">Personal baseline</th>
              <th scope="col" className="px-3 py-2 font-semibold">Change</th>
              <th scope="col" className="px-3 py-2 font-semibold">Smoothed shift</th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              <th scope="col" className="py-2 pl-3 font-semibold">In joint pattern</th>
            </tr>
          </thead>
          <tbody>
            {analysis.timelines.map((tl) => {
              const n = snapshot.nodes[tl.def.id]
              const cat = analysis.dataset.categories.find((c) => c.id === tl.def.category)
              return (
                <tr key={tl.def.id} className="border-b border-border/60">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <button className="text-text-strong underline-offset-2 hover:underline" onClick={() => onSelect(tl.def.id)}>
                      {tl.def.label}
                    </button>
                  </th>
                  <td className="px-3 py-2 text-muted">{cat?.label ?? tl.def.category}</td>
                  <td className="mono px-3 py-2 text-text-strong">
                    {num(n.lastValue, tl.def.decimals)} {tl.def.unit}
                    {!n.observedToday && n.lastObservedDay ? <span className="ml-1 text-faint">(day {n.lastObservedDay})</span> : null}
                  </td>
                  <td className="mono px-3 py-2 text-muted">{num(n.baselineMedian, tl.def.decimals)}</td>
                  <td className="mono px-3 py-2 text-text">{n.percentChange !== null ? `${signed(n.percentChange, 0)}%` : '—'}</td>
                  <td className="mono px-3 py-2 text-text">{signed(n.shift, 2)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={n.status} />
                  </td>
                  <td className="py-2 pl-3 text-muted">{n.inPattern ? 'yes' : n.member ? 'shifted, not core' : 'no'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <p className="eyebrow mb-2 text-text-strong">Relationships supported on day {day}</p>
        {relationships.length === 0 ? (
          <p className="text-xs text-muted">None yet. Relationships are evaluated once at least {analysis.config.relationship.minPairs} paired days exist.</p>
        ) : (
          <ul className="grid gap-1.5 md:grid-cols-2">
            {relationships.map((r) => (
              <li key={r.id}>
                <button className="flex w-full items-center justify-between gap-3 rounded-xs border border-border bg-surface-2/60 px-2.5 py-1.5 text-left text-xs text-text hover:border-accent/50" onClick={() => onCompare(r.a, r.b)}>
                  <span>
                    {label(r.leader)} {r.lagDays > 0 ? `→ (${r.lagDays} d) ` : '↔ '}
                    {label(r.follower)}
                  </span>
                  <span className="mono text-accent-2">ρ {num(r.rho, 2)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10.5px] text-muted">Associations in day-to-day fluctuations. None of them shows that one measurement causes another.</p>
      </div>
    </div>
  )
}
