import { BODY_SYSTEMS, FIGURE_PATHS, type BodySystem } from '../../data/bodySystems'
import type { Band, SystemId } from '../../data/selfcheck'

/**
 * The crew figure: line art with one clickable region per body system. Each
 * region carries its own status colour, so the whole body reads at a glance
 * before anything is opened.
 *
 * Drawn in the drafting voice of the rest of the instrument — stroke only,
 * no fills except the status wash on a selected or off-band region.
 */

const BAND_STROKE: Record<Band, string> = {
  nominal: 'var(--ok)',
  watch: 'var(--warn)',
  caution: 'var(--danger)',
}

export function BodyFigure({
  statuses,
  selected,
  onSelect,
  className = '',
}: {
  statuses: Partial<Record<SystemId, Band | null>>
  selected: SystemId | null
  onSelect: (id: SystemId) => void
  className?: string
}) {
  return (
    <svg viewBox="0 0 200 380" className={`block w-full ${className}`} role="group" aria-label="Crew body systems">
      {/* Reference frame, as a drawing carries one */}
      <g stroke="var(--border-strong)" fill="none" strokeWidth="0.6">
        <path d="M8 8 h20 M8 8 v20 M192 8 h-20 M192 8 v20 M8 372 h20 M8 372 v-20 M192 372 h-20 M192 372 v-20" />
        <line x1="100" y1="8" x2="100" y2="372" strokeDasharray="2 6" strokeOpacity="0.5" />
      </g>

      {/* The figure itself */}
      <g stroke="var(--muted)" fill="none" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        {FIGURE_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* One hit region per system */}
      {BODY_SYSTEMS.map((sys) => {
        const band = statuses[sys.id] ?? null
        const isSel = selected === sys.id
        const stroke = band ? BAND_STROKE[band] : 'var(--muted)'
        return (
          <g
            key={sys.id}
            onClick={() => onSelect(sys.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(sys.id)
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`${sys.label}${band ? `, ${band}` : ''}`}
            aria-pressed={isSel}
            className="cursor-pointer outline-none"
          >
            <path
              d={sys.region}
              fill={isSel ? stroke : band && band !== 'nominal' ? stroke : 'transparent'}
              fillOpacity={isSel ? 0.22 : band && band !== 'nominal' ? 0.14 : 0}
              stroke={stroke}
              strokeWidth={isSel ? 1.8 : 1.1}
              strokeOpacity={isSel ? 1 : 0.75}
              style={{ transition: 'fill-opacity 220ms cubic-bezier(.2,0,0,1), stroke-width 220ms cubic-bezier(.2,0,0,1)' }}
            />
            {/* Leader line out to the margin, technical-callout style */}
            <line
              x1={sys.anchor[0]}
              y1={sys.anchor[1]}
              x2={sys.anchor[0] > 100 ? 186 : 14}
              y2={sys.anchor[1]}
              stroke={stroke}
              strokeWidth="0.7"
              strokeOpacity={isSel ? 0.9 : 0.3}
              strokeDasharray="2 3"
            />
            <circle cx={sys.anchor[0] > 100 ? 186 : 14} cy={sys.anchor[1]} r={isSel ? 3 : 2} fill={stroke} opacity={isSel ? 1 : 0.5} />
          </g>
        )
      })}
    </svg>
  )
}

/** The margin index that pairs with the figure's leader lines. */
export function SystemIndex({
  statuses,
  selected,
  onSelect,
}: {
  statuses: Partial<Record<SystemId, Band | null>>
  selected: SystemId | null
  onSelect: (id: SystemId) => void
}) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {BODY_SYSTEMS.map((sys: BodySystem) => {
        const band = statuses[sys.id] ?? null
        const isSel = selected === sys.id
        return (
          <li key={sys.id}>
            <button
              onClick={() => onSelect(sys.id)}
              className={`group flex w-full items-center gap-3 py-2.5 pl-3 pr-2 text-left transition-colors duration-200 ${
                isSel ? 'bg-surface-3 text-text-strong' : 'text-text hover:text-text-strong'
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0"
                style={{ background: band ? BAND_STROKE[band] : 'var(--faint)' }}
              />
              <span className="flex-1 text-[12px] leading-snug">{sys.label}</span>
              <span className="annotate shrink-0">{band ? band.toUpperCase() : 'NO DATA'}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
