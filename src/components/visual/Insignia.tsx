import { useId } from 'react'

/**
 * The AURORA mark: an original mission insignia drawn from the programme's own
 * idea — an aurora arc rising over a planetary limb, crossed by an orbit.
 * Nothing here reproduces an existing agency emblem.
 */

export function Insignia({ size = 34, className = '' }: { size?: number; className?: string }) {
  // Scoped per instance: several marks can share a page without clashing defs
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-limb`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
          <stop offset="55%" stopColor="var(--accent-2)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--text-strong)" />
        </linearGradient>
        <clipPath id={`${id}-disc`}>
          <circle cx="32" cy="32" r="29" />
        </clipPath>
      </defs>

      <circle cx="32" cy="32" r="29" fill="var(--bg-deep)" />

      <g clipPath={`url(#${id}-disc)`}>
        {/* Planetary limb sweeping below the frame */}
        <circle cx="32" cy="63" r="30" fill="none" stroke={`url(#${id}-limb)`} strokeWidth="4" />
        <circle cx="32" cy="63" r="22" fill="var(--surface)" />
        {/* The aurora itself */}
        <path d="M4 44 Q32 27 60 44" fill="none" stroke="var(--ember)" strokeWidth="1.6" opacity="0.85" />
      </g>

      <ellipse
        cx="32"
        cy="32"
        rx="29"
        ry="11"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        opacity="0.5"
        transform="rotate(-22 32 32)"
      />
      <circle cx="32" cy="32" r="29" fill="none" stroke="var(--border-strong)" strokeWidth="1.5" />
      <circle cx="46.5" cy="19" r="2.3" fill="var(--text-strong)" />
    </svg>
  )
}

/**
 * The full patch, with the programme name set around the rim — used where the
 * mark is given room to breathe.
 */
export function MissionPatch({ size = 160, className = '', spin = true }: { size?: number; className?: string; spin?: boolean }) {
  const rim = `rim-${useId().replace(/:/g, '')}`
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" className={`absolute inset-0 ${spin ? 'orbit-slow' : ''}`}>
        <defs>
          <path id={rim} d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" />
        </defs>
        <text
          fill="var(--muted)"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.34em' }}
        >
          <textPath href={`#${rim}`} startOffset="0%">
            AUTONOMOUS UNDERSTANDING OF RISK · OBSERVATION · ASTRONAUT RESILIENCE ·
          </textPath>
        </text>
      </svg>

      <svg viewBox="0 0 200 200" className="absolute inset-0">
        <circle cx="100" cy="100" r="70" fill="none" stroke="var(--border-strong)" strokeWidth="1" />
        <circle cx="100" cy="100" r="66" fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" />
      </svg>

      <div className="absolute inset-[22%]">
        <Insignia size={size * 0.56} />
      </div>
    </div>
  )
}
