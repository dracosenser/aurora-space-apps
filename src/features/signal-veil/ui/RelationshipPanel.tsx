import { Spline } from 'lucide-react'
import type { MissionAnalysis } from '../../../engine/analysis'
import type { VeilSnapshot } from '../model/snapshot'
import { Button } from '../../../components/ui/Button'
import { LagProfile, OverlapStrips, ResidualScatter } from './charts'
import { Bullets, RelationshipBadge, Section, Stat, num, pValue } from './shared'

/**
 * Evidence for (or against) a relationship between two signals.
 * The panel only ever reports what the engine evaluated; drawing a line
 * between two signals cannot make them related.
 */
export function RelationshipPanel({
  analysis,
  connection,
  day,
  snapshot,
  colorOf,
  onPick,
  onForget,
}: {
  analysis: MissionAnalysis
  connection: { a: string; b: string } | null
  day: number
  snapshot: VeilSnapshot
  colorOf: (id: string) => string
  onPick: (a: string, b: string) => void
  onForget: () => void
}) {
  const label = (id: string) => analysis.timelineOf(id).def.label
  const short = (id: string) => analysis.timelineOf(id).def.shortLabel
  const result = connection ? analysis.relationshipBetween(connection.a, connection.b, day) : undefined
  const cfg = analysis.config.relationship

  return (
    <div className="space-y-4">
      {!result ? (
        <div className="rounded-sm border border-dashed border-border-strong px-4 py-6 text-center">
          <Spline className="mx-auto h-5 w-5 text-faint" />
          <p className="mt-2 text-sm font-medium text-text-strong">Draw a line between two signals</p>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
            Press on one signal and drag to another. AURORA shows whether their day-to-day changes are statistically associated, and the evidence either way.
          </p>
        </div>
      ) : (
        <>
          <header>
            <p className="eyebrow">Relationship · as of day {day}</p>
            <h3 className="display mt-1.5 text-[1.45rem] leading-tight">
              <span style={{ color: colorOf(result.leader) }}>{label(result.leader)}</span>
              <span className="mx-2 text-muted">{result.status === 'supported' && result.lagDays > 0 ? '→' : '↔'}</span>
              <span style={{ color: colorOf(result.follower) }}>{label(result.follower)}</span>
            </h3>
            <div className="mt-2">
              <RelationshipBadge status={result.status} />
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-text">{result.explanation}</p>
          </header>

          {result.status !== 'insufficient-data' && (
            <>
              <div className="grid grid-cols-3 gap-x-3 gap-y-3">
                <Stat label="Spearman ρ" value={num(result.rho, 2)} note="rank correlation" />
                {result.status === 'supported' ? (
                  <Stat label="Timing" value={result.lagDays === 0 ? 'same day' : `${result.lagDays} d`} note={result.lagDays === 0 ? 'no lead' : `${short(result.leader)} first`} />
                ) : (
                  <Stat label="Timing" value="—" note="no supported lead" />
                )}
                <Stat label="q-value" value={pValue(result.qValue)} note={`needs ≤ ${cfg.alpha}`} />
                <Stat label="Paired days" value={result.nPairs} note={`needs ≥ ${cfg.minPairs}`} />
                <Stat label="Effective n" value={Math.round(result.nEffective)} note="after autocorrelation" />
                <Stat label="Both halves" value={result.consistentAcrossHalves ? 'agree' : 'differ'} note="split-record check" />
              </div>

              <Section title="Correlation by lag" note={`±${cfg.maxLagDays} days tested`}>
                <LagProfile result={result} aLabel={short(result.a)} bLabel={short(result.b)} />
              </Section>

              <Section title="Supporting measurements" note="day-to-day deviations">
                <ResidualScatter analysis={analysis} result={result} leaderLabel={short(result.leader)} followerLabel={short(result.follower)} />
                <p className="mt-1 text-[10.5px] leading-snug text-muted">
                  Each point is one day. Values are deviations from that indicator's own recent level, so a shared slow trend cannot produce the association.
                </p>
              </Section>
            </>
          )}

          <Section title="Overlapping periods" note="descriptive only">
            <OverlapStrips analysis={analysis} a={result.a} b={result.b} day={day} aColor={colorOf(result.a)} bColor={colorOf(result.b)} aLabel={short(result.a)} bLabel={short(result.b)} />
            <p className="mt-1 text-[10.5px] leading-snug text-muted">
              {result.overlapDays > 0
                ? `Both were shifted from baseline on ${result.overlapDays} day${result.overlapDays === 1 ? '' : 's'}${result.overlapStart ? ` (days ${result.overlapStart}–${result.overlapEnd})` : ''}.`
                : 'The two were never shifted from baseline on the same day.'}{' '}
              Two signals changing during the same period is not counted as evidence that they are related.
            </p>
          </Section>

          <Section title="Limits of this evidence">
            <Bullets items={result.limitations} />
          </Section>

          <details className="border-t border-border pt-3 text-[11.5px] text-muted">
            <summary className="eyebrow cursor-pointer text-text-strong">How this is tested</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
              <li>Each indicator's slow trend is removed with a {cfg.detrendWindowDays}-day centred rolling median.</li>
              <li>Spearman rank correlation is computed at lags from −{cfg.maxLagDays} to +{cfg.maxLagDays} days.</li>
              <li>The sample size is reduced for autocorrelation before the significance test.</li>
              <li>The best lag's p-value is multiplied by the number of lags tested.</li>
              <li>Benjamini–Hochberg correction is applied across every pair of signals.</li>
              <li>A relationship is reported only if q ≤ {cfg.alpha}, |ρ| ≥ {cfg.minAbsRho}, and the sign agrees in both halves of the record.</li>
            </ol>
          </details>
        </>
      )}

      <Section title="Lines you have drawn" note={`${snapshot.supportedFound} of ${snapshot.supportedAvailable} supported found`}>
        {snapshot.links.length === 0 ? (
          <p className="text-[11.5px] text-muted">None yet. On day {day} the engine supports {snapshot.supportedAvailable} relationship{snapshot.supportedAvailable === 1 ? '' : 's'} between signals; the rest have been tested and are not supported.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {snapshot.links.map((l) => {
                const active = !!connection && ((connection.a === l.a && connection.b === l.b) || (connection.a === l.b && connection.b === l.a))
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => onPick(l.a, l.b)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xs border px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${active ? 'border-accent/60 bg-accent/10 text-text-strong' : 'border-border bg-surface-2/60 text-text hover:border-accent/40'}`}
                    >
                      <span className="truncate">
                        {short(l.leader)} {l.status === 'supported' && l.lagDays > 0 ? '→' : '↔'} {short(l.follower)}
                      </span>
                      <span className={`mono shrink-0 ${l.status === 'supported' ? 'text-accent-2' : 'text-muted'}`}>
                        {l.status === 'supported' ? `ρ ${num(l.rho, 2)}` : l.status === 'not-established' ? 'not established' : 'insufficient'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={onForget}>
              Clear drawn lines
            </Button>
          </>
        )}
      </Section>
    </div>
  )
}
