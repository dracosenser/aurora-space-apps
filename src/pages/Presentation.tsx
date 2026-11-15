import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Lightbulb, Orbit, Target, TriangleAlert } from 'lucide-react'
import { useMission } from '../hooks/useMission'
import { Button } from '../components/ui/Button'
import { MissionPatch } from '../components/visual/Insignia'
import { Blueprint } from '../components/visual/Blueprint'
import { RuledHeading } from '../components/ui/Misc'

export function Presentation() {
  const m = useMission()
  return (
    <div className="mx-auto max-w-5xl">
      {/* Title plate */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="panel ticked relative overflow-hidden px-6 py-12 md:px-12 md:py-16"
      >
        <div className="plate-grid pointer-events-none absolute inset-0" />

        {/* The patch, set in the right margin */}
        <div className="pointer-events-none absolute -right-12 top-1/2 hidden -translate-y-1/2 opacity-45 lg:block">
          <MissionPatch size={250} className="text-muted" />
        </div>

        <div className="relative max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="eyebrow text-accent">NASA Space Apps Challenge 2026</span>
          </div>

          <h1 className="display mt-5 text-[clamp(3rem,9vw,5.5rem)]">AURORA</h1>
          <p className="eyebrow-sm mt-3">Autonomous Understanding of Risk, Observation &amp; Astronaut Resilience</p>

          <p className="display-italic mt-7 text-[clamp(1.3rem,3vw,2.1rem)] text-text-strong">
            “Because every explorer matters. Every signal counts.”
          </p>

          <p className="mt-5 text-pretty text-sm leading-relaxed text-text">
            An astronaut health-intelligence platform for lunar and Mars missions: continuous multivariable monitoring,
            explainable early warning, interactive what-if simulation and a data-grounded assistant, built on NASA's open
            human-research foundation.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <Button variant="primary" icon={<ArrowRight className="h-4 w-4" />} onClick={() => m.setPage('mission-control')}>
              Open the live demo
            </Button>
            <Button variant="outline" icon={<BookOpen className="h-4 w-4" />} onClick={() => m.setPage('sources')}>
              Sources &amp; science
            </Button>
          </div>
        </div>
      </motion.section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Section icon={Target} title="The problem" accent="danger">
          <p>On the ISS, a crew member with a health concern is hours from a hospital and seconds from a flight surgeon. On a Mars mission the round-trip communication delay reaches 40 minutes, evacuation is impossible for years, and the crew must be its own clinic.</p>
          <p>Health data on long missions arrives from many instruments: wearables, actigraphy, exercise hardware, dosimeters and daily check-ins. Individually each signal is noisy; together they carry early information about deconditioning, sleep loss, radiation exposure and behavioral strain. Today that integration happens largely by hand, with Earth in the loop.</p>
        </Section>
        <Section icon={Orbit} title="Why it matters for lunar and Mars exploration" accent="accent">
          <p>NASA's Human Research Program tracks dozens of human-system risks for exploration missions: bone and muscle loss, sleep and circadian disruption, behavioral health, and radiation carcinogenesis among them. Lunar surface stays and Mars transits make every one of them longer, farther and more autonomous.</p>
          <p>A crew that can see its own trends, understand why an alert fired and explore the consequences of a plan change gains decision margin exactly where Earth cannot help in real time.</p>
        </Section>
      </div>

      {/* The system, drawn as an engineering sheet rather than listed as cards */}
      <section className="mt-10">
        <RuledHeading note="DWG. AUR-001 · REV. B">How AURORA works</RuledHeading>
        <Blueprint />
        <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { title: 'Monitor', body: 'Daily indicators across cardiovascular, sleep, physical, radiation and behavioral categories for every crew member.' },
            { title: 'Analyse', body: 'Interactive time series, date-range filters, crew comparison and historical trend tables.' },
            { title: 'Warn', body: 'Transparent statistical rules flag level shifts, irregularity, risky combinations and crew-wide events, each with a confidence rationale.' },
            { title: 'Simulate', body: 'A what-if model projects muscle, bone, sleep, fatigue, heart rate and dose against the baseline plan as parameters change.' },
            { title: 'Explain', body: 'A local assistant answers questions from the live data, shows its reasoning and separates fact from hypothesis.' },
          ].map((c, i) => (
            <div key={c.title}>
              <p className="eyebrow-sm">{String(i + 1).padStart(2, '0')}</p>
              <p className="mt-1.5 text-[13px] font-medium text-text-strong">{c.title}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Section icon={BookOpen} title="How NASA data and research contribute" accent="info">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>The Human Research Program's risk taxonomy and evidence reports define which indicators matter and how to talk about them responsibly.</li>
            <li>MSL/RAD radiation measurements in transit and on the Martian surface set the dose rates used in the data model and simulator.</li>
            <li>Peer-reviewed spaceflight studies on sleep, bone and muscle set realistic baselines and drift rates.</li>
            <li>NASA-STD-3001 provides the 600 mSv career exposure limit used as an operational threshold.</li>
            <li>The Open Science Data Repository and Life Sciences Data Archive are the integration targets for real research data; NASA's DONKI API supplies optional live space weather.</li>
          </ul>
          <p className="text-muted">All crew data in the demo is synthetic and labelled as such. No NASA partnership or endorsement is implied.</p>
        </Section>
        <Section icon={Lightbulb} title="What makes AURORA innovative" accent="ok">
          <ul className="list-disc space-y-1.5 pl-4">
            <li><strong className="text-text-strong">Explainability first.</strong> Every alert exposes its rule, its numbers, its confidence rationale and a review checklist. No black box.</li>
            <li><strong className="text-text-strong">Personal baselines.</strong> Deviation is measured against each astronaut's own rolling history, not population norms.</li>
            <li><strong className="text-text-strong">Combination logic.</strong> The system reasons about patterns across indicators, which is where early signals live.</li>
            <li><strong className="text-text-strong">Decision support that runs offline.</strong> Simulation and assistant work without any external service, as a Mars crew would need.</li>
            <li><strong className="text-text-strong">Scientific honesty as a feature.</strong> Simulated and real are visually separated everywhere; limitations are part of the interface.</li>
          </ul>
        </Section>
      </div>

      <Section icon={TriangleAlert} title="Limitations and future development" accent="warn" className="mt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-semibold text-text-strong">Current limitations</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>All crew data is synthetic; the anomaly rules are tuned on injected scenarios, not on real astronaut records.</li>
              <li>The simulator is a first-order illustrative model, not a validated physiological one.</li>
              <li>The assistant is rule-based; it answers a fixed set of analytical intents.</li>
              <li>Inter-indicator correlations, medication, nutrition and individual variability are not modelled.</li>
              <li>No clinical validation and no regulatory review has been performed.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-text-strong">Next steps</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Ingest de-identified research datasets from OSDR and LSDA to calibrate baselines and rule thresholds.</li>
              <li>Add change-point detection and multivariate methods alongside the current rules, keeping the explanation layer.</li>
              <li>Validate the simulator against published analog and ISS longitudinal data with uncertainty bands.</li>
              <li>Optional on-device language model for the assistant, constrained to the same data-grounded answers.</li>
              <li>Crew-facing privacy controls: medical data belongs to the astronaut.</li>
            </ul>
          </div>
        </div>
      </Section>

      <div className="mt-6 rounded-lg border border-border bg-surface px-6 py-5 text-center">
        <p className="text-sm font-medium text-text-strong">Demonstration script and methodology</p>
        <p className="mt-1 text-xs text-muted">
          See <span className="mono">docs/DEMO_SCRIPT.md</span>, <span className="mono">docs/METHODOLOGY.md</span> and <span className="mono">docs/DATA_SOURCES.md</span> in the repository.
        </p>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children, accent, className = '' }: { icon: typeof Target; title: string; children: React.ReactNode; accent: 'danger' | 'accent' | 'info' | 'ok' | 'warn'; className?: string }) {
  const color = { danger: 'text-danger', accent: 'text-accent', info: 'text-accent-2', ok: 'text-ok', warn: 'text-warn' }[accent]
  return (
    <section className={`rounded-lg border border-border bg-surface p-5 ${className}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <h2 className="eyebrow text-text-strong">{title}</h2>
      </div>
      <div className="mt-3 space-y-2 text-xs leading-relaxed text-text">{children}</div>
    </section>
  )
}
