import { memo } from 'react'

/**
 * Line diagrams in the manner of a vintage astronomy plate: flat strokes, no
 * fills, no lighting. These sit alongside the photography as the publication's
 * technical apparatus rather than as decoration. Colour comes from
 * `currentColor`, so a diagram always matches the text it sits beside.
 */

/** Concentric orbital rings — a system diagram, drawn rather than rendered. */
export const OrbitRings = memo(function OrbitRings({ className = '', size = 420 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="0.75">
        <circle cx="200" cy="200" r="196" strokeDasharray="1 8" />
        <circle cx="200" cy="200" r="156" />
        <circle cx="200" cy="200" r="110" strokeDasharray="4 6" />
        <circle cx="200" cy="200" r="62" />
        <ellipse cx="200" cy="200" rx="186" ry="62" transform="rotate(-18 200 200)" />
        <ellipse cx="200" cy="200" rx="146" ry="102" transform="rotate(34 200 200)" />
      </g>
      <g fill="currentColor">
        <circle cx="200" cy="200" r="3" />
        <circle cx="376" cy="142" r="2.2" />
        <circle cx="98" cy="274" r="1.8" />
      </g>
      <g stroke="currentColor" strokeWidth="0.75">
        <path d="M200 2v16M200 382v16M2 200h16M382 200h16" />
      </g>
    </svg>
  )
})

/** A transfer trajectory with its insertion and arrival marks. */
export function TrajectoryArc({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 120" className={className} aria-hidden="true">
      <path d="M8 104 C 86 12, 234 12, 312 72" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 4" opacity="0.5" />
      <path d="M8 104 C 86 12, 180 16, 214 30" fill="none" stroke="currentColor" strokeWidth="1" />
      <g fill="currentColor">
        <circle cx="8" cy="104" r="2.4" />
        <circle cx="214" cy="30" r="2.8" />
      </g>
      <circle cx="312" cy="72" r="2.4" fill="none" stroke="currentColor" strokeWidth="0.75" />
      <path d="M214 30v20" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
    </svg>
  )
}

/** Fine measurement ruling, used as an edge detail along a plate margin. */
export function Ruler({ className = '', ticks = 40, vertical = false }: { className?: string; ticks?: number; vertical?: boolean }) {
  const span = ticks * 8
  return (
    <svg
      viewBox={vertical ? `0 0 12 ${span}` : `0 0 ${span} 12`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {Array.from({ length: ticks }, (_, i) =>
        vertical ? (
          <line key={i} x1="12" y1={i * 8} x2={i % 5 === 0 ? 2 : 7} y2={i * 8} stroke="currentColor" strokeWidth="1" />
        ) : (
          <line key={i} x1={i * 8} y1="12" x2={i * 8} y2={i % 5 === 0 ? 2 : 7} stroke="currentColor" strokeWidth="1" />
        ),
      )}
    </svg>
  )
}

/**
 * A block of scientific coordinates, set the way a plate margin carries them.
 * Values are passed in; nothing is invented here.
 */
export function Coordinates({ rows, className = '' }: { rows: [string, string][]; className?: string }) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 ${className}`}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="annotate">{k}</dt>
          <dd className="annotate text-muted">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
