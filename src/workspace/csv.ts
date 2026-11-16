import { ENV_SUBJECT, type ReadingRow, type Workspace } from './types'

/**
 * CSV import and export for user measurements.
 *
 * Two layouts are accepted:
 *   long   day, subject, indicator, value
 *   wide   day, subject, <one column per indicator>
 * The subject column is optional when a default subject is supplied.
 * Delimiters may be commas, semicolons or tabs.
 */

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows.map((r) => r.map((c) => c.trim()))
}

// NFKD folds characters such as the subscript in CO₂ to plain ASCII before matching.
const norm = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')

const DAY_HEADERS = ['day', 'missionday', 'md', 'sol']
const SUBJECT_HEADERS = ['subject', 'crew', 'astronaut', 'crewmember', 'who', 'id']
const INDICATOR_HEADERS = ['indicator', 'measurement', 'metric', 'signal']
const VALUE_HEADERS = ['value', 'reading', 'result']
const ENV_NAMES = ['environment', 'env', 'cabin', 'spaceconditions', 'conditions', 'vehicle', 'habitat']

export interface ImportResult {
  format: 'long' | 'wide' | 'unknown'
  rows: ReadingRow[]
  /** Rows that could not be read, with the reason. */
  errors: string[]
  unknownSubjects: string[]
  unknownIndicators: string[]
  /** Readings outside the indicator's plausible range: imported, but excluded from analysis. */
  implausible: number
}

export function resolveSubject(ws: Workspace, text: string): string | null {
  const key = norm(text)
  if (!key) return null
  if (ENV_NAMES.includes(key) || text === ENV_SUBJECT) return ENV_SUBJECT
  const hit = ws.crew.find((c) => norm(c.id) === key || norm(c.name) === key)
  return hit ? hit.id : null
}

export function resolveIndicator(ws: Workspace, text: string): string | null {
  const key = norm(text)
  if (!key) return null
  const hit = ws.indicators.find((i) => norm(i.id) === key || norm(i.label) === key || norm(i.shortLabel) === key)
  return hit ? hit.id : null
}

function parseNumber(text: string): number {
  const t = text.trim()
  if (t === '') return NaN
  // Accept a decimal comma when there is no decimal point.
  return Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t)
}

/**
 * Read measurements from CSV text.
 * @param defaultSubject used when the file has no subject column
 */
export function parseReadings(text: string, ws: Workspace, defaultSubject: string | null = null): ImportResult {
  const out: ImportResult = { format: 'unknown', rows: [], errors: [], unknownSubjects: [], unknownIndicators: [], implausible: 0 }
  const table = parseCsv(text)
  if (table.length < 2) {
    out.errors.push('The file needs a header row and at least one data row.')
    return out
  }
  const header = table[0].map(norm)
  const dayCol = header.findIndex((h) => DAY_HEADERS.includes(h))
  const subjectCol = header.findIndex((h) => SUBJECT_HEADERS.includes(h))
  const indicatorCol = header.findIndex((h) => INDICATOR_HEADERS.includes(h))
  const valueCol = header.findIndex((h) => VALUE_HEADERS.includes(h))
  if (dayCol < 0) {
    out.errors.push('No "day" column found. The first row must name the columns.')
    return out
  }
  const long = indicatorCol >= 0 && valueCol >= 0
  out.format = long ? 'long' : 'wide'

  const unknownSubjects = new Set<string>()
  const unknownIndicators = new Set<string>()
  // In the wide layout every remaining column is an indicator.
  const wideColumns: { col: number; id: string | null; name: string }[] = []
  if (!long) {
    table[0].forEach((name, col) => {
      if (col === dayCol || col === subjectCol || name.trim() === '') return
      const id = resolveIndicator(ws, name)
      if (!id) unknownIndicators.add(name)
      wideColumns.push({ col, id, name })
    })
    if (wideColumns.length === 0) out.errors.push('No measurement columns found.')
  }

  const push = (subject: string, indicatorId: string, day: number, value: number) => {
    const ind = ws.indicators.find((i) => i.id === indicatorId)!
    if (value < ind.plausibleRange[0] || value > ind.plausibleRange[1]) out.implausible++
    out.rows.push({ subject, indicatorId, day, value })
  }

  for (let r = 1; r < table.length; r++) {
    const line = table[r]
    const day = parseNumber(line[dayCol] ?? '')
    if (!Number.isInteger(day) || day < 1) {
      out.errors.push(`Row ${r + 1}: "${line[dayCol] ?? ''}" is not a mission day.`)
      continue
    }
    let rowSubject: string | null = defaultSubject
    if (subjectCol >= 0) {
      const name = line[subjectCol] ?? ''
      if (name !== '') {
        rowSubject = resolveSubject(ws, name)
        if (!rowSubject) {
          unknownSubjects.add(name)
          continue
        }
      }
    }
    if (long) {
      const name = line[indicatorCol] ?? ''
      const id = resolveIndicator(ws, name)
      if (!id) {
        if (name) unknownIndicators.add(name)
        continue
      }
      const value = parseNumber(line[valueCol] ?? '')
      if (!Number.isFinite(value)) {
        if ((line[valueCol] ?? '') !== '') out.errors.push(`Row ${r + 1}: "${line[valueCol]}" is not a number.`)
        continue
      }
      const ind = ws.indicators.find((i) => i.id === id)!
      const isEnv = ind.scope === 'environment'
      const subject = isEnv ? ENV_SUBJECT : rowSubject
      if (!subject || (!isEnv && subject === ENV_SUBJECT)) {
        out.errors.push(`Row ${r + 1}: ${ind.label} needs a crew member.`)
        continue
      }
      push(subject, id, day, value)
    } else {
      for (const c of wideColumns) {
        if (!c.id) continue
        const cell = line[c.col] ?? ''
        if (cell === '') continue
        const value = parseNumber(cell)
        if (!Number.isFinite(value)) {
          out.errors.push(`Row ${r + 1}, ${c.name}: "${cell}" is not a number.`)
          continue
        }
        const ind = ws.indicators.find((i) => i.id === c.id)!
        // Space-condition columns always belong to the environment, whatever the row's subject.
        const isEnv = ind.scope === 'environment'
        const subject = isEnv ? ENV_SUBJECT : rowSubject
        if (!subject || (!isEnv && subject === ENV_SUBJECT)) {
          out.errors.push(`Row ${r + 1}, ${c.name}: needs a crew member.`)
          continue
        }
        push(subject, c.id, day, value)
      }
    }
  }
  out.unknownSubjects = [...unknownSubjects]
  out.unknownIndicators = [...unknownIndicators]
  if (out.errors.length > 25) out.errors = [...out.errors.slice(0, 25), `…and ${out.errors.length - 25} more.`]
  return out
}

function cell(v: string | number): string {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Every reading in long format, one per line. */
export function toCsv(ws: Workspace): string {
  const lines = ['day,subject,indicator,value,unit,source']
  const subjects = [...ws.crew.map((c) => ({ key: c.id, name: c.name })), { key: ENV_SUBJECT, name: 'environment' }]
  for (const s of subjects) {
    for (const ind of ws.indicators) {
      const series = ws.readings[s.key]?.[ind.id]
      if (!series) continue
      const prov = ws.provenance[s.key]?.[ind.id] ?? 'user-entered'
      for (const day of Object.keys(series).map(Number).sort((a, b) => a - b)) {
        lines.push([day, cell(s.name), ind.id, series[day], cell(ind.unit), prov].join(','))
      }
    }
  }
  return lines.join('\n') + '\n'
}

/** A wide-format starting point listing the indicators currently tracked. */
export function csvTemplate(ws: Workspace): string {
  const crewCols = ws.indicators.filter((i) => i.enabled && i.scope === 'crew').map((i) => i.id)
  const envCols = ws.indicators.filter((i) => i.enabled && i.scope === 'environment').map((i) => i.id)
  const who = ws.crew[0]?.name ?? 'Crew member name'
  const header = ['day', 'subject', ...crewCols, ...envCols].join(',')
  const blank = (n: number) => new Array(n).fill('').join(',')
  return `${header}\n1,${cell(who)},${blank(crewCols.length + envCols.length)}\n2,${cell(who)},${blank(crewCols.length + envCols.length)}\n`
}
