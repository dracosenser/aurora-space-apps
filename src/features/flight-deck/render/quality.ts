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
 *
 * Resolution is expressed as a fraction of the display's OWN pixels, not of a
 * capped device-pixel ratio. The earlier form multiplied a dpr cap by a scale,
 * which on a retina panel left even the top preset rendering 80 per cent of
 * native and the rest closer to half, upscaled by the compositor. That was
 * measured, and it was the whole of the blur: multisampling cannot sharpen an
 * image that is stretched after it is drawn.
 */

export type QualityName = 'low' | 'medium' | 'high'

export interface Quality {
  name: QualityName
  /**
   * Fraction of the display's own pixels to render. 1 means native: one
   * rendered pixel per physical pixel, which is the only way thin structural
   * edges and console text come out sharp on a high-density screen.
   */
  nativeFraction: number
  /**
   * Absolute ceiling on buffer pixels. Native resolution on a 4K or 5K panel
   * is more fill than this shader can carry, so beyond this the fraction is
   * reduced to fit rather than letting the frame rate collapse.
   */
  maxPixels: number
  /**
   * Fraction of the frame's resolution the planet is drawn at before being
   * brought up to size. The planet has no hard edges in it, so this costs
   * almost nothing visually and saves the square of itself in fill.
   */
  skyScale: number
  /**
   * How far from the eye, in metres, procedural surface detail is applied.
   * 0 switches it off. It is the first thing a struggling machine should lose,
   * because it is the only effect here that costs per pixel and adds nothing
   * a viewer can name when it is gone.
   */
  detailRange: number
  /** Shadow map edge, in texels. 0 disables the sun shadow entirely. */
  shadowSize: number
  /** Percentage-closer-filter taps: 1 is a hard edge, 9 is a soft one. */
  pcf: 1 | 9
  /**
   * Fixtures sent to the shader for their specular highlight, at most 4.
   * The diffuse contribution of every fixture is baked into the vertices, so
   * this no longer controls how brightly the vessel is lit — only how many
   * moving highlights it carries.
   */
  maxLights: 1 | 2 | 4
  /** Octaves on the planet's terrain and cloud noise. */
  planetOctaves: number
}

export const QUALITY: Record<QualityName, Quality> = {
  low: {
    name: 'low',
    nativeFraction: 0.66,
    maxPixels: 1_100_000,
    skyScale: 0.4,
    detailRange: 0,
    shadowSize: 0,
    pcf: 1,
    maxLights: 1,
    planetOctaves: 4,
  },
  medium: {
    name: 'medium',
    nativeFraction: 0.85,
    maxPixels: 2_400_000,
    skyScale: 0.55,
    detailRange: 4.5,
    shadowSize: 1024,
    pcf: 1,
    maxLights: 2,
    planetOctaves: 5,
  },
  high: {
    name: 'high',
    nativeFraction: 1,
    maxPixels: 5_000_000,
    skyScale: 0.7,
    detailRange: 7,
    shadowSize: 2048,
    pcf: 9,
    maxLights: 4,
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
  /**
   * Presets this governor has already had to retreat from. Climbing back into
   * one is what produces a picture that pulses, because the conditions that
   * forced the retreat are usually still there — so each return trip is made
   * harder than the last. Without this, a machine sitting near the threshold
   * oscillates indefinitely: the step up pushes the frame time over the line,
   * the step down brings it back under, and nothing ever settles.
   */
  private demotions = new Map<QualityName, number>()

  /** Frames to wait after a change before trusting the average again. */
  private static readonly SETTLE = 24
  private static readonly SLOW_MS = 26
  private static readonly FAST_MS = 11
  // Asymmetric on purpose. Dropping a preset is a rescue and should happen
  // within a fraction of a second, which matters most on entering fullscreen,
  // where the pixel count can jump eightfold in one frame. Climbing back is a
  // luxury and waits for a long, settled run so the picture does not pulse.
  private static readonly SLOW_RUN = 14
  private static readonly FAST_RUN = 260

  /**
   * Forget the running average. Called when the frame size changes under the
   * governor's feet — entering or leaving fullscreen — so it judges the new
   * size on its own merits instead of carrying the old one's average.
   */
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
        this.demotions.set(current, (this.demotions.get(current) ?? 0) + 1)
        return QUALITY_ORDER[i - 1]
      }
    } else if (this.avg < QualityGovernor.FAST_MS) {
      this.slowRun = 0
      const up = QUALITY_ORDER[i + 1]
      // Each failed attempt at a preset trebles how long the machine must look
      // comfortable before it is offered again, and after three it is dropped
      // for the session. Three climbs is enough to tell a passing hitch from a
      // machine that cannot hold the preset.
      const tries = up ? (this.demotions.get(up) ?? 0) : 0
      const need = QualityGovernor.FAST_RUN * Math.pow(3, tries)
      if (++this.fastRun > need && i < QUALITY_ORDER.length - 1 && tries < 3) {
        this.fastRun = 0
        this.settled = 0
        return up
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
