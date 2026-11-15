/**
 * THREE-RING INSTRUMENT, per the NASApunk component grammar: an outer ring of
 * function ticks, a middle ring carrying the value arc and needle, and an
 * inner circle holding the status line.
 *
 * Geometry law: both value-arc endpoints are computed from one centre at one
 * radius, and the needle tip reaches the ring track rather than floating short
 * of its scale.
 */

const C = 110
const R_OUTER = 100
const R_TRACK = 76
const R_INNER = 48

const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const
}

/** Sweep runs from 7 o'clock round to 5 o'clock — a 280° instrument scale. */
const START = 220
const SWEEP = 280

export function ThreeRing({
  value,
  label,
  status,
  tone = 'var(--screen-glow)',
  size = 220,
  className = '',
}: {
  value: number
  label: string
  status: string
  tone?: string
  size?: number
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value)) / 100
  const end = START + SWEEP * pct
  const [sx, sy] = polar(START, R_TRACK)
  const [ex, ey] = polar(end, R_TRACK)
  const [nx, ny] = polar(end, R_TRACK - 2)
  const [hx, hy] = polar(end, R_INNER + 4)

  return (
    <svg viewBox="0 0 220 220" width={size} height={size} className={`shrink-0 ${className}`} role="img" aria-label={`${label}: ${Math.round(value)} of 100, ${status}`}>
      {/* Outer ring — function ticks */}
      <circle cx={C} cy={C} r={R_OUTER} fill="none" stroke="var(--border-strong)" strokeWidth="0.8" />
      <g stroke="var(--muted)" strokeWidth="1">
        {Array.from({ length: 29 }, (_, i) => {
          const deg = START + (SWEEP / 28) * i
          const major = i % 7 === 0
          const [x1, y1] = polar(deg, R_OUTER - 1)
          const [x2, y2] = polar(deg, R_OUTER - (major ? 12 : 6))
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity={major ? 0.9 : 0.4} />
        })}
      </g>
      <g fill="var(--faint)" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em' }}>
        {[0, 25, 50, 75, 100].map((v) => {
          const [x, y] = polar(START + (SWEEP / 100) * v, R_OUTER - 15)
          return (
            <text key={v} x={x} y={y + 3} textAnchor="middle">
              {v}
            </text>
          )
        })}
      </g>

      {/* Middle ring — the value arc, both endpoints on one centre */}
      <circle cx={C} cy={C} r={R_TRACK} fill="none" stroke="var(--border-strong)" strokeWidth="5" strokeOpacity="0.35" />
      <path
        d={`M${sx.toFixed(2)} ${sy.toFixed(2)} A${R_TRACK} ${R_TRACK} 0 ${SWEEP * pct > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`}
        fill="none"
        stroke={tone}
        strokeWidth="5"
        strokeLinecap="butt"
        style={{ transition: 'd 600ms cubic-bezier(.2,0,0,1)' }}
      />

      {/* Needle — tip reaches the track inner edge */}
      <line x1={hx} y1={hy} x2={nx} y2={ny} stroke="var(--text-strong)" strokeWidth="1.6" />
      <circle cx={C} cy={C} r="3" fill="var(--text-strong)" />

      {/* Inner circle — status line */}
      <circle cx={C} cy={C} r={R_INNER} fill="none" stroke="var(--border)" strokeWidth="0.8" />
      <text
        x={C}
        y={C - 8}
        textAnchor="middle"
        fill="var(--text-strong)"
        style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '-0.02em' }}
      >
        {Math.round(value)}
      </text>
      <text
        x={C}
        y={C + 14}
        textAnchor="middle"
        fill="var(--muted)"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 8, fontWeight: 500, letterSpacing: '0.22em' }}
      >
        {label.toUpperCase()}
      </text>
      <text
        x={C}
        y={C + 30}
        textAnchor="middle"
        fill={tone}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em' }}
      >
        {status.toUpperCase()}
      </text>
    </svg>
  )
}
