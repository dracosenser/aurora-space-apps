import { useId } from 'react'

/**
 * The AURORA mark, drawn as an engraving: an aurora arc rising over a
 * planetary limb, crossed by an orbit. Flat strokes only — no gradient, no
 * fill lighting. Nothing here reproduces an agency emblem; NASA's insignia and
 * logotype are not public domain and are used nowhere in this project.
 */
export function Insignia({ size = 34, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={`${id}-disc`}>
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id}-disc)`}>
        {/* The limb, and the body below it held as a flat tone */}
        <circle cx="32" cy="62" r="29" fill="var(--surface-3)" />
        <circle cx="32" cy="62" r="29" fill="none" stroke="currentColor" strokeWidth="1.25" />
        {/* The aurora */}
        <path d="M3 43 Q32 26 61 43" fill="none" stroke="var(--ember)" strokeWidth="1.5" />
      </g>

      {/* Orbit */}
      <ellipse
        cx="32"
        cy="32"
        rx="28"
        ry="10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.75"
        transform="rotate(-22 32 32)"
      />
      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="45.5" cy="19.5" r="1.9" fill="currentColor" />
    </svg>
  )
}

/**
 * The full patch, with the programme name set around the rim — used where the
 * mark is given room to breathe.
 */
export function MissionPatch({ size = 160, className = '' }: { size?: number; className?: string }) {
  const rim = `rim-${useId().replace(/:/g, '')}`
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="absolute inset-0">
        <defs>
          <path id={rim} d="M100,100 m-84,0 a84,84 0 1,1 168,0 a84,84 0 1,1 -168,0" />
        </defs>
        <text
          fill="currentColor"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 8.5, fontWeight: 500, letterSpacing: '0.38em' }}
        >
          <textPath href={`#${rim}`} startOffset="0%">
            AUTONOMOUS UNDERSTANDING OF RISK · OBSERVATION · ASTRONAUT RESILIENCE ·
          </textPath>
        </text>
        <g fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.5">
          <circle cx="100" cy="100" r="72" />
          <circle cx="100" cy="100" r="68" strokeDasharray="1 6" />
        </g>
      </svg>

      <div className="absolute inset-[26%]">
        <Insignia size={size * 0.48} />
      </div>
    </div>
  )
}
