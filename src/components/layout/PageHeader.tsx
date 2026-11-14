import type { ReactNode } from 'react'
import { SimulatedTag } from '../ui/Misc'

export function PageHeader({ title, description, actions, simulated = true }: { title: string; description: string; actions?: ReactNode; simulated?: boolean }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-text-strong">{title}</h1>
          {simulated && <SimulatedTag />}
        </div>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
