import type { ReactNode } from 'react'

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 rounded-md border border-border-strong bg-surface-2 px-2.5 text-sm text-text-strong outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-md border border-border-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-2.5 ${size === 'sm' ? 'h-6 text-[11px]' : 'h-7 text-xs'} font-medium transition-colors ${
            value === o.value ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text-strong'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-strong">{label}</span>
        <span className="mono text-sm text-accent">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
        aria-label={label}
      />
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

export function Checkbox({ checked, onChange, label, color }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; color?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${checked ? 'border-transparent' : 'border-border-strong bg-surface-2'}`}
        style={checked ? { background: color ?? 'var(--accent)' } : undefined}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="#04121a" strokeWidth="2">
            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}
