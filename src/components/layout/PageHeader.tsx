import type { ReactNode } from 'react'
import { SimulatedTag } from '../ui/Misc'

interface Props {
  title: string
  description: string
  actions?: ReactNode
  simulated?: boolean
  /** Letterspaced label above the title — the section this plate belongs to. */
  eyebrow?: string
  /** Archival plate reference, set in the right margin. */
  plate?: string
}

/**
 * The opening of every page, set like the title block of an archival plate:
 * a letterspaced section label, an oversized engraved title, and a hairline
 * separating the heading from the instruments below.
 */
export function PageHeader({ title, description, actions, simulated = true, eyebrow, plate }: Props) {
  return (
    <header className="reveal mb-7">
      {(eyebrow || plate || simulated) && (
        <div className="mb-3.5 flex items-center gap-3">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <span className="h-px flex-1 bg-border" />
          {simulated && <SimulatedTag />}
          {plate && <span className="annotate">{plate}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-2xl">
          <h1 className="display text-[clamp(2rem,4.4vw,3.1rem)]">{title}</h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div>}
      </div>

      <div className="mt-6 h-px w-full bg-border" />
    </header>
  )
}
