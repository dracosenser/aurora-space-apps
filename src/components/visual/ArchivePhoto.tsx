import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ArchiveFrame } from '../../data/archive'

/**
 * A photographic plate, mounted the way an archive mounts one: the frame is
 * monochrome and matte, screened with a halftone dot and overlaid with a cool
 * duotone cast, with its catalogue reference and provenance set in the margin.
 *
 * If the frame has not been fetched yet, the plate renders as an empty sleeve
 * — ruled stock with its reference still printed on it. That is a designed
 * state, not a broken image, so the layout reads correctly either way.
 */

interface Props {
  frame: ArchiveFrame
  /** Where the catalogue margin sits. 'none' leaves the plate bare. */
  caption?: 'below' | 'overlay' | 'none'
  /** Reticle crosses, as printed on a lunar survey frame. */
  reticles?: boolean
  /** A very slow vertical drift as the plate passes through the viewport. */
  parallax?: boolean
  /** Strength of the halftone screen, 0–1. */
  screen?: number
  className?: string
  /** Fills its container rather than holding an aspect ratio. */
  fill?: boolean
  ratio?: string
  children?: ReactNode
  priority?: boolean
}

export function ArchivePhoto({
  frame,
  caption = 'below',
  reticles = false,
  parallax = false,
  screen = 0.5,
  className = '',
  fill = false,
  ratio = '4 / 3',
  children,
  priority = false,
}: Props) {
  const [state, setState] = useState<'loading' | 'ready' | 'absent'>('loading')
  const imgRef = useRef<HTMLImageElement>(null)
  const [shift, setShift] = useState(0)

  useEffect(() => {
    if (!parallax) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frameId = 0
    const onScroll = () => {
      if (frameId) return
      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        const el = imgRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > window.innerHeight) return
        // −1 at the bottom of the viewport, +1 at the top
        const progress = 1 - (r.top + r.height / 2) / (window.innerHeight / 2 + r.height / 2)
        setShift(Math.max(-1, Math.min(1, progress)) * 14)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [parallax])

  const plate = (
    <div
      className={`plate plate-tint relative ${fill ? 'h-full w-full' : ''}`}
      style={fill ? undefined : { aspectRatio: ratio }}
    >
      {state !== 'absent' && (
        <img
          ref={imgRef}
          src={frame.src}
          alt={frame.caption}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('ready')}
          onError={() => setState('absent')}
          className={`photo absolute inset-0 transition-opacity duration-1000 ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          style={parallax ? { transform: `translate3d(0, ${shift.toFixed(1)}px, 0) scale(1.06)` } : undefined}
        />
      )}

      {/* Halftone screen, as on a reprinted photograph */}
      <div className="halftone pointer-events-none absolute inset-0" style={{ opacity: screen }} />

      {reticles && <div className="reticles pointer-events-none absolute inset-0" />}

      {/* Empty sleeve: ruled stock with its reference still printed on it */}
      {state === 'absent' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="eyebrow-sm">Archive sleeve</span>
          <span className="annotate">{frame.plate} · ASSET NOT PRESENT</span>
        </div>
      )}

      {caption === 'overlay' && state === 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-3">
          <span className="annotate text-text-strong/70">{frame.plate}</span>
          <span className="annotate text-text-strong/70">{frame.annotation}</span>
        </div>
      )}

      {children}
    </div>
  )

  if (caption !== 'below') return <figure className={className}>{plate}</figure>

  return (
    <figure className={className}>
      {plate}
      <figcaption className="mt-2.5 border-t border-border pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="annotate shrink-0 text-muted">{frame.plate}</span>
          <span className="annotate truncate text-right" title={frame.annotation}>
            {frame.annotation}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-text">{frame.caption}</p>
        {frame.credit && (
          <p className="annotate mt-1 truncate" title={frame.credit.title}>
            NASA · {frame.credit.nasaId.toUpperCase()}
            {frame.credit.date ? ` · ${frame.credit.date}` : ''}
          </p>
        )}
      </figcaption>
    </figure>
  )
}
