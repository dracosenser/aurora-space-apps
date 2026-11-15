import { ARCHIVE_CREDITS, type ArchiveCredit } from './archiveCredits'

/**
 * The archival frames the layout is composed around.
 *
 * Each slot carries its own editorial annotation — a catalogue number and a
 * caption written for this publication — alongside whatever provenance the
 * fetch script recorded from NASA's library. Frames are referenced by local
 * path so the build is self-contained; run `npm run archive` to populate them.
 */

export type ArchiveSlug = 'masthead' | 'lunar-survey' | 'launch' | 'orbiter' | 'earth-limb' | 'deep-field'

export interface ArchiveFrame {
  slug: ArchiveSlug
  /** Catalogue reference printed in the plate margin. */
  plate: string
  /** Short caption in the publication's own voice. */
  caption: string
  /** Technical annotation: an instrument note, not a measurement of anything real. */
  annotation: string
  src: string
  credit?: ArchiveCredit
}

const FRAMES: Omit<ArchiveFrame, 'src' | 'credit'>[] = [
  {
    slug: 'masthead',
    plate: 'PL. I',
    caption: 'Ringed body, outer system survey',
    annotation: 'MONOCHROME SEPARATION · ARCHIVE SCAN',
  },
  {
    slug: 'lunar-survey',
    plate: 'PL. II',
    caption: 'Lunar surface, oblique survey frame',
    annotation: 'RETICLE GRID · CONTACT PRINT',
  },
  {
    slug: 'launch',
    plate: 'PL. III',
    caption: 'Ascent, first-stage burn',
    annotation: 'TRACKING CAMERA · LONG LENS',
  },
  {
    slug: 'orbiter',
    plate: 'PL. IV',
    caption: 'Orbital hardware, solar array deployed',
    annotation: 'EXTERNAL SURVEY · ARCHIVE SCAN',
  },
  {
    slug: 'earth-limb',
    plate: 'PL. V',
    caption: 'Terrestrial limb at orbital night',
    annotation: 'HORIZON SENSOR REFERENCE',
  },
  {
    slug: 'deep-field',
    plate: 'PL. VI',
    caption: 'Deep field, extragalactic survey',
    annotation: 'LONG EXPOSURE · STACKED',
  },
]

export const ARCHIVE: Record<ArchiveSlug, ArchiveFrame> = Object.fromEntries(
  FRAMES.map((f) => [
    f.slug,
    {
      ...f,
      src: `${import.meta.env.BASE_URL}archive/${f.slug}.jpg`,
      credit: ARCHIVE_CREDITS[f.slug],
    },
  ]),
) as Record<ArchiveSlug, ArchiveFrame>

export const ARCHIVE_LIST: ArchiveFrame[] = FRAMES.map((f) => ARCHIVE[f.slug])

/** True once the fetch script has recorded provenance for at least one frame. */
export const ARCHIVE_POPULATED = Object.keys(ARCHIVE_CREDITS).length > 0
