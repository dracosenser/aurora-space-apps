import { memo, useMemo } from 'react'

/**
 * Ambient visual layers for the archive: a deterministic star field, a faint
 * astronomical coordinate grid and a film-grain screen. Everything is drawn
 * from code — no raster assets — so the production build stays weightless and
 * the atmosphere scales to any viewport.
 *
 * Star positions come from a fixed seed so the sky is the same on every visit
 * and across reloads: a catalogue, not noise.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Star {
  x: number
  y: number
  r: number
  o: number
  twinkle: boolean
  delay: number
}

function buildStars(count: number, seed: number, maxRadius: number): Star[] {
  const rand = mulberry32(seed)
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    const magnitude = rand()
    stars.push({
      x: rand() * 100,
      y: rand() * 100,
      // Most stars are faint pinpricks; a few carry the composition.
      r: 0.28 + Math.pow(magnitude, 3.2) * maxRadius,
      o: 0.2 + Math.pow(magnitude, 1.5) * 0.72,
      twinkle: magnitude > 0.93,
      delay: rand() * 9,
    })
  }
  return stars
}

function StarLayer({ count, seed, maxRadius, className }: { count: number; seed: number; maxRadius: number; className: string }) {
  const stars = useMemo(() => buildStars(count, seed, maxRadius), [count, seed, maxRadius])
  return (
    <svg
      className={`absolute inset-[-12%] h-[124%] w-[124%] ${className}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r * 0.1}
          fill="#dfe9f8"
          opacity={s.o}
          style={
            s.twinkle
              ? { animation: `twinkle ${5 + (i % 5)}s ease-in-out ${s.delay}s infinite` }
              : undefined
          }
        />
      ))}
    </svg>
  )
}

/**
 * The fixed backdrop, mounted once behind the whole application. Hidden in the
 * archival-paper (light) theme, where the page reads as a printed document.
 */
export function Atmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Faint plate ruling — the coordinate grid of an astronomical chart */}
      <div className="plate-grid absolute inset-0 opacity-70" />

      {/* Two parallax star layers drifting at different rates */}
      <div className="absolute inset-0" style={{ opacity: 'var(--star-opacity)' }}>
        <StarLayer count={170} seed={20260411} maxRadius={1.5} className="drift-a" />
        <StarLayer count={90} seed={77712} maxRadius={2.4} className="drift-b opacity-70" />
      </div>

      {/* Deep-field glows that sit beneath the content and never compete with it */}
      <div
        className="absolute -left-[12%] top-[-18%] h-[520px] w-[520px] rounded-full opacity-60 blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(60,110,220,0.16), transparent 68%)' }}
      />
      <div
        className="absolute -right-[10%] top-[22%] h-[460px] w-[460px] rounded-full opacity-50 blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(255,122,53,0.08), transparent 70%)' }}
      />
    </div>
  )
}

/**
 * A short, restrained star field scoped to a single section (hero, panels),
 * layered above a section background rather than the page.
 */
export const LocalStars = memo(function LocalStars({ seed = 4412, count = 70, className = '' }: { seed?: number; count?: number; className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={{ opacity: 'var(--star-opacity)' }} aria-hidden="true">
      <StarLayer count={count} seed={seed} maxRadius={1.9} className="drift-b" />
    </div>
  )
})
