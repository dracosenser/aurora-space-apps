import { missionDate } from '../data/mission'

export function fmtDate(day: number): string {
  return missionDate(day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function fmtMET(day: number): string {
  return `MD ${day}`
}

export function fmtElapsed(day: number): string {
  const years = Math.floor((day - 1) / 365)
  const rem = (day - 1) % 365
  const months = Math.floor(rem / 30)
  const days = rem % 30
  const parts: string[] = []
  if (years) parts.push(`${years}y`)
  if (months) parts.push(`${months}m`)
  parts.push(`${days}d`)
  return parts.join(' ')
}

export function fmtNum(v: number, decimals = 1): string {
  if (!isFinite(v)) return '—'
  return v.toFixed(decimals)
}

export function fmtSigned(v: number, decimals = 1): string {
  if (!isFinite(v)) return '—'
  const s = v.toFixed(decimals)
  return v > 0 ? `+${s}` : s
}

export function fmtPct(v: number, decimals = 0): string {
  if (!isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
