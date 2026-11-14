import { useState } from 'react'
import { ExternalLink, FlaskConical, Database, BookOpen, Scale, Plug, Building2 } from 'lucide-react'
import type { SourceEntry } from '../types'
import { SOURCES } from '../data/sources'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Segmented } from '../components/ui/Controls'

type Kind = SourceEntry['kind'] | 'all'

const KIND_META: Record<SourceEntry['kind'], { label: string; icon: typeof Database }> = {
  dataset: { label: 'Dataset', icon: Database },
  research: { label: 'Research', icon: BookOpen },
  program: { label: 'Program', icon: Building2 },
  standard: { label: 'Standard', icon: Scale },
  api: { label: 'API', icon: Plug },
}

export function Sources() {
  const [kind, setKind] = useState<Kind>('all')
  const list = SOURCES.filter((s) => kind === 'all' || s.kind === kind)

  return (
    <div>
      <PageHeader
        eyebrow="Project · 06"
        plate="PLATE 06"
        title="Sources & Science"
        description="Every real NASA program, dataset, standard and peer-reviewed paper that informs AURORA, with what each represents and its limitations. Real research is kept strictly separate from the synthetic demonstration data."
        simulated={false}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Scientific methodology in brief">
          <div className="space-y-3 text-xs leading-relaxed text-text">
            <p>
              <strong className="text-text-strong">Indicator selection</strong> mirrors the risk areas of NASA's Human Research Program: cardiovascular adaptation, sleep and circadian health, musculoskeletal deconditioning, space radiation and behavioral health. Each category uses measures that are plausible to collect continuously on a long-duration mission (wearables, actigraphy, exercise logs, dosimetry, daily check-ins).
            </p>
            <p>
              <strong className="text-text-strong">Synthetic data</strong> is produced by a seeded generator whose baselines and drift rates are informed by published magnitudes: roughly 6-7 hours of in-flight sleep (Barger et al.), about 1.8 mSv/day galactic cosmic ray dose in transit and 0.6-0.7 mSv/day on the unshielded surface (MSL/RAD), bone loss on the order of 1% per month that resistive exercise reduces (Stavnichuk et al.), and muscle strength losses documented after six-month ISS missions (Trappe et al.). Specific scenarios (a schedule-disrupted engineer, a deconditioning geologist, a stressed commander during conjunction, two solar particle events) are injected so the detection logic can be demonstrated.
            </p>
            <p>
              <strong className="text-text-strong">Anomaly detection</strong> is deliberately transparent: 7-day windows against each person's own 30-day baseline (with a 7-day gap), z-scores, variability tests, trend slopes and rule combinations. Confidence is a function of deviation size, persistence and the number of independent indicators. The system raises statistical anomalies; it never diagnoses.
            </p>
            <p>
              <strong className="text-text-strong">The simulator</strong> uses first-order response equations with the same published magnitudes and NASA-STD-3001's 600 mSv career limit as a reference threshold. It is illustrative and non-validated by design.
            </p>
            <p className="text-muted">Full details: <span className="mono">docs/METHODOLOGY.md</span> in the repository.</p>
          </div>
        </Card>
        <Card title="Real vs. simulated" subtitle="How to read everything in AURORA">
          <ul className="space-y-3 text-xs leading-relaxed">
            <li className="flex gap-2">
              <Badge tone="warn" className="mt-0.5 shrink-0"><FlaskConical className="h-3 w-3" /></Badge>
              <span className="text-text"><strong className="text-text-strong">Simulated:</strong> the Ares Meridiani mission, all four crew members, every daily indicator value, every mission event, every alert and every simulator curve.</span>
            </li>
            <li className="flex gap-2">
              <Badge tone="info" className="mt-0.5 shrink-0"><BookOpen className="h-3 w-3" /></Badge>
              <span className="text-text"><strong className="text-text-strong">Real:</strong> the sources on this page, the magnitudes they report that shaped the generator, the NASA-STD-3001 exposure limit, and the optional live NASA DONKI space-weather feed on Mission Control.</span>
            </li>
            <li className="text-muted">AURORA has no NASA partnership or endorsement. It is an independent NASA Space Apps Challenge 2026 entry built on public resources.</li>
          </ul>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow text-text-strong">Source catalogue ({list.length})</h2>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ value: 'all', label: 'All' }, { value: 'program', label: 'Programs' }, { value: 'dataset', label: 'Datasets' }, { value: 'research', label: 'Research' }, { value: 'standard', label: 'Standards' }, { value: 'api', label: 'APIs' }]}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {list.map((s) => {
          const Icon = KIND_META[s.kind].icon
          return (
            <article key={s.id} className="flex flex-col rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md border border-border bg-surface-2 p-2 text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-strong">{s.name}</h3>
                    <Badge tone="neutral">{KIND_META[s.kind].label}</Badge>
                  </div>
                  <p className="text-xs text-muted">{s.organization}</p>
                </div>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-border-strong px-2 py-1 text-[11px] text-accent hover:bg-accent/10">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <dl className="mt-3 grid gap-2 text-xs">
                <Row label="Description">{s.description}</Row>
                <Row label="What it represents">{s.represents}</Row>
                <Row label="Limitations">{s.limitations}</Row>
                <Row label="Used in AURORA for">{s.usedFor}</Row>
              </dl>
              <p className="mono mt-3 truncate text-[10px] text-muted">{s.url}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow-sm">{label}</dt>
      <dd className="leading-relaxed text-text">{children}</dd>
    </div>
  )
}
