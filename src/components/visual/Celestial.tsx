import { memo } from 'react'

/**
 * Original celestial compositions drawn entirely in SVG: a planetary limb with
 * its atmosphere catching the light, coordinate graticules, orbital rings and
 * trajectory arcs. These carry the archive's visual language without
 * reproducing any photograph or agency artwork.
 */

/**
 * An enormous planet rising from below the frame, lit from the right so the
 * composition stays legible where the type sits, on the left.
 */
export const PlanetLimb = memo(function PlanetLimb({ className = '' }: { className?: string }) {
  return (
    <div className={`h-full w-full ${className}`}>
    <svg viewBox="0 0 1200 430" preserveAspectRatio="xMidYMax slice" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="pl-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.06"/>
          <stop offset="20%" stopColor="var(--accent)" stopOpacity="0.3"/>
          <stop offset="46%" stopColor="var(--accent-2)" stopOpacity="0.8"/>
          <stop offset="66%" stopColor="var(--text-strong)" stopOpacity="1"/>
          <stop offset="84%" stopColor="var(--accent-2)" stopOpacity="0.66"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.18"/>
        </linearGradient>

        <linearGradient id="pl-haze" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0"/>
          <stop offset="30%" stopColor="var(--accent)" stopOpacity="0.34"/>
          <stop offset="62%" stopColor="var(--accent-2)" stopOpacity="0.78"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.12"/>
        </linearGradient>

        <radialGradient id="pl-body" cx="66%" cy="0%" r="82%">
          <stop offset="0%" stopColor="var(--planet-lit)"/>
          <stop offset="26%" stopColor="var(--planet-mid)"/>
          <stop offset="58%" stopColor="var(--planet-dark)"/>
          <stop offset="100%" stopColor="var(--planet-deep)"/>
        </radialGradient>

        <linearGradient id="pl-terminator" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--planet-shadow)" stopOpacity="0.92"/>
          <stop offset="26%" stopColor="var(--planet-shadow)" stopOpacity="0.6"/>
          <stop offset="54%" stopColor="var(--planet-shadow)" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="var(--planet-shadow)" stopOpacity="0"/>
        </linearGradient>

        <clipPath id="pl-clip"><circle cx="620" cy="1118" r="960"/></clipPath>
        <filter id="pl-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="pl-softer" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="30"/></filter>
      </defs>

      <circle cx="620" cy="1118" r="996" fill="none" stroke="url(#pl-haze)" strokeWidth="56" filter="url(#pl-softer)" opacity="var(--planet-haze-outer)"/>
      <circle cx="620" cy="1118" r="970" fill="none" stroke="url(#pl-haze)" strokeWidth="17" filter="url(#pl-soft)" opacity="var(--planet-haze-inner)"/>
      <circle cx="620" cy="1118" r="960" fill="url(#pl-body)"/>

      <g clipPath="url(#pl-clip)">
        <ellipse cx="880" cy="238" rx="300" ry="78" fill="var(--planet-mottle)" opacity="0.5" filter="url(#pl-soft)"/>
        <ellipse cx="420" cy="290" rx="250" ry="66" fill="var(--planet-mottle)" opacity="0.5" filter="url(#pl-soft)"/>
        <ellipse cx="700" cy="360" rx="430" ry="90" fill="var(--planet-mottle)" opacity="0.45" filter="url(#pl-soft)"/>

        <g stroke="var(--accent-2)" fill="none" strokeWidth="0.9" opacity="0.17">
          <ellipse cx="620" cy="1118" rx="960" ry="930"/>
          <ellipse cx="620" cy="1118" rx="960" ry="884"/>
          <ellipse cx="620" cy="1118" rx="960" ry="828"/>
          <ellipse cx="620" cy="1118" rx="960" ry="762"/>
          <ellipse cx="300" cy="1118" rx="360" ry="960"/>
          <ellipse cx="460" cy="1118" rx="228" ry="960"/>
          <ellipse cx="620" cy="1118" rx="104" ry="960"/>
          <ellipse cx="780" cy="1118" rx="228" ry="960"/>
          <ellipse cx="940" cy="1118" rx="360" ry="960"/>
        </g>

        <rect x="0" y="150" width="1200" height="980" fill="url(#pl-terminator)"/>
      </g>

      <circle cx="620" cy="1118" r="960" fill="none" stroke="url(#pl-rim)" strokeWidth="2"/>
    </svg>
    </div>
  )
})

/** Concentric orbital rings — a planetary system diagram as ornament. */
export const OrbitRings = memo(function OrbitRings({ className = '', size = 460 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} className={className} aria-hidden="true">
      <g fill="none" stroke="var(--border-strong)" strokeWidth="0.8">
        <circle cx="200" cy="200" r="196" strokeDasharray="1 7" opacity="0.7" />
        <circle cx="200" cy="200" r="158" opacity="0.5" />
        <circle cx="200" cy="200" r="112" strokeDasharray="3 6" opacity="0.6" />
        <circle cx="200" cy="200" r="64" opacity="0.4" />
      </g>
      {/* Inclined orbits, as on an orrery plate */}
      <g fill="none" stroke="var(--accent)" strokeWidth="0.9" opacity="0.4">
        <ellipse cx="200" cy="200" rx="188" ry="64" transform="rotate(-18 200 200)" />
        <ellipse cx="200" cy="200" rx="148" ry="104" transform="rotate(34 200 200)" />
      </g>
      {/* Bodies on their tracks */}
      <circle cx="200" cy="200" r="5" fill="var(--text-strong)" />
      <circle cx="378" cy="142" r="3" fill="var(--ember)" />
      <circle cx="96" cy="276" r="2.4" fill="var(--accent-2)" />
      {/* Quadrant ticks */}
      <g stroke="var(--border-strong)" strokeWidth="1">
        <path d="M200 4v14M200 382v14M4 200h14M382 200h14" />
      </g>
    </svg>
  )
})

/** A trajectory arc with its insertion and arrival marks. */
export function TrajectoryArc({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 120" className={className} aria-hidden="true">
      <path d="M8 104 C 86 12, 234 12, 312 72" fill="none" stroke="var(--accent)" strokeWidth="1.1" strokeDasharray="4 4" opacity="0.6" />
      <path d="M8 104 C 86 12, 180 16, 214 30" fill="none" stroke="var(--accent-2)" strokeWidth="1.4" />
      <circle cx="8" cy="104" r="3" fill="var(--text-strong)" />
      <circle cx="214" cy="30" r="3.4" fill="var(--ember)" />
      <circle cx="312" cy="72" r="2.6" fill="none" stroke="var(--muted)" strokeWidth="1" />
      <g stroke="var(--border-strong)" strokeWidth="0.8" opacity="0.8">
        <path d="M214 30v22M8 104h-0.01" />
      </g>
    </svg>
  )
}

/** Fine measurement ruling, used as an edge detail on archival panels. */
export function Ruler({ className = '', ticks = 40 }: { className?: string; ticks?: number }) {
  return (
    <svg viewBox={`0 0 ${ticks * 8} 12`} preserveAspectRatio="none" className={className} aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => (
        <line
          key={i}
          x1={i * 8}
          y1="12"
          x2={i * 8}
          y2={i % 5 === 0 ? 2 : 7}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />
      ))}
    </svg>
  )
}
