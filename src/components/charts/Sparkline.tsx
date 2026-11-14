export function Sparkline({
  values,
  color = 'var(--accent)',
  height = 28,
  width = 96,
  fill = true,
}: {
  values: number[]
  color?: string
  height?: number
  width?: number
  fill?: boolean
}) {
  if (values.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1
    const y = height - 2 - ((v - min) / range) * (height - 4)
    return [x, y]
  })
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  const last = pts[pts.length - 1]

  return (
    <svg width={width} height={height} className="mt-1 shrink-0 overflow-visible">
      {fill && <path d={area} fill={color} opacity={0.1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      {/* The latest reading, marked */}
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} opacity={0.22} />
      <circle cx={last[0]} cy={last[1]} r={1.4} fill={color} />
    </svg>
  )
}

/**
 * A status dial. The track is a hairline; the reading is drawn on top, so the
 * ring reads as an instrument rather than a progress bar.
 */
export function ScoreRing({
  score,
  size = 64,
  stroke = 4,
  color,
  label,
}: {
  score: number
  size?: number
  stroke?: number
  color?: string
  label?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const col = color ?? (score >= 80 ? 'var(--ok)' : score >= 65 ? 'var(--warn)' : 'var(--danger)')

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-strong)" strokeWidth={1} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
          opacity={0.9}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono font-medium leading-none text-text-strong" style={{ fontSize: size * 0.3 }}>
          {Math.round(score)}
        </span>
        {label && <span className="eyebrow-sm mt-1">{label}</span>}
      </div>
    </div>
  )
}
