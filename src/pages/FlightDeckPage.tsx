import { FlightDeck } from '../features/flight-deck'
import { PageHeader } from '../components/layout/PageHeader'
import { Disclaimer, RuledHeading } from '../components/ui/Misc'
import { STATIONS } from '../features/flight-deck'

/**
 * The vessel as a page of AURORA.
 *
 * Every console aboard reads the same MissionProvider the rest of the
 * application reads, so the deck is another way into the same data rather
 * than a second copy of it.
 */
export function FlightDeckPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Operations · 04"
        plate="PLATE FD"
        title="Flight Deck"
        description="Walk the research vessel. Five consoles are live: navigation, the medical bay, crew quarters, environmental control and communications. Each one is an interface to the mission you are already looking at — select a crew member here and the rest of AURORA follows."
      />

      <FlightDeck />

      <div className="mt-10">
        <RuledHeading note={`${STATIONS.length} BAYS`}>What is aboard</RuledHeading>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {STATIONS.map((s) => (
            <div key={s.id} className="bg-surface p-4">
              <p className="annotate">{s.bay}</p>
              <p className="mt-1 text-[14px] text-text-strong">{s.label}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{s.hint}</p>
            </div>
          ))}
        </div>

        <Disclaimer className="mt-5">
          The vessel is an interface, not a simulation of a spacecraft. AURORA models no
          trajectory and no life support, so the deck shows no distance travelled and the
          cabin figures are fixed nominal values rather than a simulated atmosphere. The
          mission scenario controls at environmental control are the real model, and changing
          them changes what the rest of the application computes. All crew data is synthetic.
        </Disclaimer>
      </div>
    </div>
  )
}
