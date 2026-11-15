/**
 * Graphics quality for the flight deck.
 *
 * Profiling the interior showed the frame is dominated by fragment work: the
 * planet shader evaluates around thirty octaves of noise per pixel, and the
 * interior runs a microfacet BRDF plus a shadow lookup per pixel. Both scale
 * with the number of pixels, so the single most effective dial is how many
 * pixels each pass actually covers. That is what these presets control, rather
 * than deleting equipment out of the vessel.
 *
 * The planet gets its own, lower scale on top of the frame scale: it is seen
 * through window panes, it is low frequency, and a crew member looking out of
 * the cupola cannot tell the difference between it and the full-resolution
 * version at arm's length from the glass.
 */

export type QualityName = 'low' | 'medium' | 'high'

export interface Quality {
  name: QualityName
  /** Device pixels per CSS pixel, before the governor trims it further. */
  maxDpr: number
  /** Fraction of the frame buffer the interior is rendered at. */
  renderScale: number
  /** Fraction of the interior's resolution the planet is rendered at. */
  skyScale: number
  /** Shadow map edge, in texels. 0 disables the sun shadow entirely. */
  shadowSize: number
  /** Percentage-closer-filter taps: 1 is a hard edge, 9 is a soft one. */
  pcf: 1 | 9
  /** Fixtures considered per fragment. */
  maxLights: number
  /** Octaves on the planet's terrain and cloud noise. */
  planetOctaves: number
}

export const QUALITY: Record<QualityName, Quality> = {
  low: {
    name: 'low',
    maxDpr: 1,
    renderScale: 0.62,
    skyScale: 0.4,
    shadowSize: 0,
    pcf: 1,
    maxLights: 6,
    planetOctaves: 4,
  },
  medium: {
    name: 'medium',
    maxDpr: 1.25,
    renderScale: 0.82,
    skyScale: 0.55,
    shadowSize: 1024,
    pcf: 1,
    maxLights: 10,
    planetOctaves: 5,
  },
  high: {
    name: 'high',
    maxDpr: 1.6,
    renderScale: 1,
    skyScale: 0.7,
    shadowSize: 2048,
    pcf: 9,
    maxLights: 16,
    planetOctaves: 7,
  },
}

export const QUALITY_ORDER: QualityName[] = ['low', 'medium', 'high']

const STORAGE_KEY = 'aurora.deck.quality.v1'

/**
 * A first guess before anything has been rendered.
 *
 * There is no reliable way to ask a browser how fast its GPU is, and the
 * renderer string is masked on most machines. So this only uses signals that
 * are actually meaningful — a software renderer, a phone, very few cores, a
 * high-density display that would otherwise be asked to fill four times the
 * pixels — and leans conservative. The frame-time governor corrects it within
 * a second or two either way, which matters more than getting it right here.
 */
export function detectQuality(): QualityName {
  if (typeof window === 'undefined') return 'medium'
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (QUALITY_ORDER as string[]).includes(saved)) return saved as QualityName
  } catch {
    /* storage unavailable */
  }

  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2')
  if (!gl) return 'low'
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : ''
  const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer)
  if (software) return 'low'

  const coarse = window.matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  const dpr = window.devicePixelRatio || 1

  if (coarse || cores <= 4) return 'low'
  if (cores <= 8 || dpr > 2) return 'medium'
  return 'high'
}

export function rememberQuality(name: QualityName): void {
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch {
    /* storage unavailable */
  }
}

export function forgetQuality(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable */
  }
}

/**
 * Watches frame time and recommends a step up or down.
 *
 * Deliberately slow to react in both directions. A step costs a reallocation
 * of the frame buffers, so a couple of stray long frames — a texture upload, a
 * panel opening, the browser doing something else — must not start it
 * oscillating between presets while someone is trying to walk down a corridor.
 */
export class QualityGovernor {
  private avg = 16
  private fastRun = 0
  private slowRun = 0
  private settled = 0

  /** Frames to wait after a change before trusting the average again. */
  private static readonly SETTLE = 45
  private static readonly SLOW_MS = 26
  private static readonly FAST_MS = 11
  private static readonly SLOW_RUN = 40
  private static readonly FAST_RUN = 260

  reset(): void {
    this.avg = 16
    this.fastRun = 0
    this.slowRun = 0
    this.settled = 0
  }

  /** Returns the quality to move to, or null to stay where it is. */
  sample(dtMs: number, current: QualityName, manual: boolean): QualityName | null {
    this.avg += (Math.min(90, dtMs) - this.avg) * 0.08
    if (this.settled < QualityGovernor.SETTLE) {
      this.settled++
      return null
    }
    // A manual choice is respected: the governor keeps measuring, so the
    // readout stays honest, but it stops moving the preset.
    if (manual) return null

    const i = QUALITY_ORDER.indexOf(current)
    if (this.avg > QualityGovernor.SLOW_MS) {
      this.fastRun = 0
      if (++this.slowRun > QualityGovernor.SLOW_RUN && i > 0) {
        this.slowRun = 0
        this.settled = 0
        return QUALITY_ORDER[i - 1]
      }
    } else if (this.avg < QualityGovernor.FAST_MS) {
      this.slowRun = 0
      if (++this.fastRun > QualityGovernor.FAST_RUN && i < QUALITY_ORDER.length - 1) {
        this.fastRun = 0
        this.settled = 0
        return QUALITY_ORDER[i + 1]
      }
    } else {
      this.slowRun = 0
      this.fastRun = 0
    }
    return null
  }

  get frameMs(): number {
    return this.avg
  }
}
