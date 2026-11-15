import type { ArchiveFrame } from '../../data/archive'
import { ArchivePhoto } from './ArchivePhoto'

/**
 * Prints mounted the way an archive mounts them: a trimmed paper mat with the
 * frame inset and a typed caption strip along the foot. Laid out as a contact
 * sheet — an even grid, deliberately broken by offsets so it reads as sheets
 * laid on a table rather than as a row of cards.
 */

export function MountedPrint({
  frame,
  ratio = '4 / 3',
  reticles = false,
  screen = 0.5,
  className = '',
}: {
  frame: ArchiveFrame
  ratio?: string
  reticles?: boolean
  screen?: number
  className?: string
}) {
  return (
    <figure className={`stock p-2.5 ${className}`}>
      <ArchivePhoto frame={frame} ratio={ratio} reticles={reticles} screen={screen} caption="none" />
      <figcaption className="mt-2.5 border-t border-ink/30 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-ink">{frame.plate}</span>
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.1em] text-ink-soft" title={frame.annotation}>
            {frame.annotation}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-ink">{frame.caption}</p>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-soft">
          {frame.credit ? `NASA · ${frame.credit.nasaId.toUpperCase()}${frame.credit.date ? ` · ${frame.credit.date}` : ''}` : 'NASA · PUBLIC DOMAIN'}
        </p>
      </figcaption>
    </figure>
  )
}

/**
 * The sheet itself. Offsets are fixed per position rather than random, so the
 * composition is the same on every visit — a laid-out sheet, not a shuffle.
 */
const OFFSETS = ['lg:mt-0', 'lg:mt-10', 'lg:mt-4', 'lg:mt-14', 'lg:mt-6', 'lg:mt-2']
const RATIOS = ['4 / 3', '3 / 4', '1 / 1', '4 / 3', '3 / 4', '1 / 1']

export function ContactSheet({ frames, className = '' }: { frames: ArchiveFrame[]; className?: string }) {
  return (
    <div className={`grid items-start gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {frames.map((f, i) => (
        <MountedPrint
          key={f.slug}
          frame={f}
          ratio={RATIOS[i % RATIOS.length]}
          reticles={f.slug === 'lunar-survey'}
          className={OFFSETS[i % OFFSETS.length]}
        />
      ))}
    </div>
  )
}
