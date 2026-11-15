#!/usr/bin/env node
/**
 * Fetches the archival photography the interface is designed around from
 * NASA's public image library, and records where each frame came from.
 *
 *   node scripts/fetch-archive.mjs
 *
 * Writes:
 *   public/archive/<slug>.jpg      the image itself
 *   src/data/archiveCredits.ts     title, NASA ID, centre and date per frame
 *
 * Nothing here is guessed: each slot is resolved by querying the library and
 * taking the best match, so the credits written out are the real ones. NASA
 * imagery is generally not subject to copyright in the United States, but it
 * still has to be credited properly — that is what archiveCredits.ts is for.
 *
 * The NASA insignia and logotype are NOT public domain and are deliberately
 * not used anywhere in this project; the AURORA mark is original.
 *
 * Subjects are planetary, lunar, orbital and hardware frames. Portraits of
 * identifiable people are intentionally not requested.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'archive')
const CREDITS = join(ROOT, 'src', 'data', 'archiveCredits.ts')

const API = 'https://images-api.nasa.gov/search'

/**
 * Each slot the layout expects. `query` resolves the frame; `must` and `avoid`
 * bias the pick so the subject matches the composition it sits in.
 */
const SLOTS = [
  {
    slug: 'masthead',
    query: 'Saturn Cassini rings',
    must: ['saturn'],
    avoid: ['artist', 'concept', 'illustration', 'logo', 'patch'],
  },
  {
    slug: 'lunar-survey',
    query: 'lunar surface crater Apollo',
    must: ['lunar', 'moon'],
    avoid: ['artist', 'concept', 'patch', 'crew portrait'],
  },
  {
    slug: 'launch',
    query: 'Saturn V launch liftoff',
    must: ['launch', 'liftoff'],
    avoid: ['artist', 'concept', 'patch'],
  },
  {
    slug: 'orbiter',
    query: 'spacecraft in orbit solar array',
    must: [],
    avoid: ['artist', 'concept', 'patch'],
  },
  {
    slug: 'earth-limb',
    query: 'Earth limb horizon from orbit',
    must: ['earth'],
    avoid: ['artist', 'concept', 'map'],
  },
  {
    slug: 'deep-field',
    query: 'galaxy Hubble deep field',
    must: ['galaxy', 'nebula', 'field'],
    avoid: ['artist', 'concept', 'illustration'],
  },
]

function scoreItem(item, slot) {
  const d = item.data?.[0]
  if (!d) return -1
  const hay = `${d.title ?? ''} ${d.description ?? ''} ${(d.keywords ?? []).join(' ')}`.toLowerCase()
  if (slot.avoid.some((w) => hay.includes(w))) return -1
  let score = 0
  for (const w of slot.must) if (hay.includes(w)) score += 10
  // Prefer frames that carry a photographic centre and a date
  if (d.center) score += 1
  if (d.date_created) score += 1
  if (d.media_type === 'image') score += 2
  return score
}

async function resolveSlot(slot) {
  const url = `${API}?q=${encodeURIComponent(slot.query)}&media_type=image`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`search failed (${res.status}) for "${slot.query}"`)
  const body = await res.json()
  const items = body?.collection?.items ?? []

  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, slot) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)

  if (!ranked.length) throw new Error(`no usable result for "${slot.query}"`)

  for (const { item } of ranked.slice(0, 6)) {
    const d = item.data[0]
    const assetRes = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(d.nasa_id)}`)
    if (!assetRes.ok) continue
    const assets = (await assetRes.json())?.collection?.items ?? []
    const hrefs = assets.map((a) => a.href)
    // Large is plenty for a web plate, and keeps the repo light
    const href =
      hrefs.find((h) => h.endsWith('~large.jpg')) ??
      hrefs.find((h) => h.endsWith('~medium.jpg')) ??
      hrefs.find((h) => h.endsWith('~orig.jpg'))
    if (!href) continue
    return {
      slug: slot.slug,
      href: href.replace(/^http:/, 'https:'),
      title: d.title ?? '',
      nasaId: d.nasa_id ?? '',
      center: d.center ?? '',
      date: (d.date_created ?? '').slice(0, 10),
    }
  }
  throw new Error(`no downloadable asset for "${slot.query}"`)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const resolved = []

  for (const slot of SLOTS) {
    process.stdout.write(`· ${slot.slug.padEnd(14)} `)
    try {
      const hit = await resolveSlot(slot)
      const img = await fetch(hit.href)
      if (!img.ok) throw new Error(`download failed (${img.status})`)
      const buf = Buffer.from(await img.arrayBuffer())
      await writeFile(join(OUT_DIR, `${slot.slug}.jpg`), buf)
      resolved.push(hit)
      console.log(`${hit.nasaId}  ${(buf.length / 1024).toFixed(0)} KB`)
    } catch (err) {
      console.log(`skipped — ${err.message}`)
    }
  }

  const body = resolved
    .map(
      (r) => `  '${r.slug}': {
    title: ${JSON.stringify(r.title)},
    nasaId: ${JSON.stringify(r.nasaId)},
    center: ${JSON.stringify(r.center)},
    date: ${JSON.stringify(r.date)},
  },`,
    )
    .join('\n')

  await writeFile(
    CREDITS,
    `/**
 * Provenance for the archival frames in public/archive/.
 * Generated by scripts/fetch-archive.mjs — do not edit by hand.
 *
 * All frames are NASA public-domain imagery. Run the script again to refresh.
 */

export interface ArchiveCredit {
  title: string
  nasaId: string
  center: string
  date: string
}

export const ARCHIVE_CREDITS: Record<string, ArchiveCredit> = {
${body}
}
`,
    'utf8',
  )

  console.log(`\n${resolved.length}/${SLOTS.length} frames written to public/archive/`)
  console.log('Credits written to src/data/archiveCredits.ts')
  if (resolved.length < SLOTS.length) {
    console.log('Slots that were skipped fall back to an empty archival plate in the UI.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
