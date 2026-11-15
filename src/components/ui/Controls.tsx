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
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && <span className="eyebrow-sm">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 rounded-sm border border-border-strong bg-surface-2 px-2.5 text-sm text-text-strong outline-none transition-colors focus:border-accent"
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

/** A mode switch styled like the band selector on a receiver. */
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
    <div className="inline-flex rounded-sm border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative rounded-xs px-2.5 ${size === 'sm' ? 'h-6 text-[10px]' : 'h-7 text-[11px]'} font-medium tracking-wide transition-colors duration-200 ${
            value === o.value ? 'bg-accent/14 text-accent' : 'text-muted hover:text-text-strong'
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
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-text-strong">{label}</span>
        <span className="mono text-[13px] text-accent">{format ? format(value) : value}</span>
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
      {hint && <p className="mt-2 text-[11px] leading-relaxed text-muted">{hint}</p>}
    </div>
  )
}

export function Checkbox({ checked, onChange, label, color }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; color?: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-text transition-colors hover:text-text-strong">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className={`flex h-[15px] w-[15px] items-center justify-center rounded-xs border transition-colors ${
          checked ? 'border-transparent' : 'border-border-strong bg-surface-2'
        }`}
        style={checked ? { background: color ?? 'var(--accent)' } : undefined}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="#03070f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.4l2.4 2.4 4.6-5.1" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}
