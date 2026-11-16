import { useEffect, useState, type ReactNode } from 'react'
import type { Workspace } from '../../workspace/types'

export type Update = (fn: (ws: Workspace) => Workspace) => void

export const INPUT = 'h-9 w-full border border-border-strong bg-transparent px-2.5 text-sm text-text-strong outline-none transition-colors placeholder:text-faint focus:border-accent'

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="eyebrow-sm">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-muted">{hint}</span>}
    </label>
  )
}

export function Panel({ title, note, children, className = '' }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel min-w-0 p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="eyebrow text-text-strong">{title}</h3>
        {note && <span className="annotate">{note}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * A text box that holds what is being typed and commits a number when the
 * user leaves it or presses Enter. An empty box commits null (clear).
 */
export function NumberCell({
  value,
  onCommit,
  decimals,
  invalid = false,
  title,
  ariaLabel,
  className = '',
}: {
  value: number | null
  onCommit: (v: number | null) => void
  decimals: number
  invalid?: boolean
  title?: string
  ariaLabel: string
  className?: string
}) {
  const shown = value === null ? '' : String(value)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])

  const commit = () => {
    const t = text.trim().replace(',', '.')
    if (t === '') {
      if (value !== null) onCommit(null)
      return
    }
    const n = Number(t)
    if (!Number.isFinite(n)) {
      setText(shown)
      return
    }
    const f = Math.pow(10, Math.min(4, decimals + 2))
    const rounded = Math.round(n * f) / f
    if (rounded !== value) onCommit(rounded)
    else setText(shown)
  }

  return (
    <input
      inputMode="decimal"
      value={text}
      title={title}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setText(shown)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={`mono h-8 w-full min-w-[4.25rem] border bg-transparent px-1.5 text-right text-[12.5px] outline-none transition-colors focus:border-accent ${
        invalid ? 'border-danger text-danger' : value === null ? 'border-border text-text' : 'border-border-strong text-text-strong'
      } ${className}`}
    />
  )
}

export function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v.toFixed(decimals).replace('-', '−')
}
