import {
  FLOATS_PER_VERTEX, buildBackstop, buildEmissive, buildHatches, buildStructure, type MeshData,
} from './geometry'
import { buildExterior } from './exterior'
import { fpsView, forward, identity, multiply, orthographic, perspective, lookAt, type Mat4 } from './mat4'
import {
  BACKSTOP_FRAG, BACKSTOP_VERT, DEPTH_FRAG, DEPTH_VERT, EMISSIVE_FRAG, SCENE_FRAG, SCENE_VERT,
  SKY_COMPOSITE_FRAG, SKY_FRAG, SKY_VERT,
} from './shaders'
import { CUPOLA, DOOR_BY_ID, ROOMS } from '../model/deck'
import { FIXTURES } from './fixtures'
import { QUALITY, type Quality, type QualityName } from './quality'

/**
 * Fixtures sent to the shader each frame, for their specular highlight only.
 * Must match MAX_LIGHTS in SCENE_FRAG.
 */
const SPECULAR_LIGHTS = 4

export interface DeckFrame {
  eye: [number, number, number]
  yaw: number
  pitch: number
  time: number
  /** 0..1. Raised when the mission has an active alert. */
  alert: number
  /**
   * Which vessel to draw. Inside, the interior mesh and the planet through the
   * cupola; outside, the exterior mesh against open sky. Never both: a crew
   * member is in one place.
   */
  mode?: 'interior' | 'exterior'
  /** How far each hatch has swung, 0 shut to 1 fully open. */
  hatches?: { inner: number; outer: number }
}

const FOV = (70 * Math.PI) / 180

/**
 * The orbit.
 *
 * The station is treated as holding a fixed attitude with the planet off the
 * bow and below, which is what the cupola looks at. What moves is the sun: once
 * per orbit it swings from the station's zenith, down past the beam, behind the
 * planet, and back. That single rotation gives the whole day/night cycle —
 * full daylight, a terminator sweeping across the disc with light grazing in
 * through the cupola panes, then night with the cabin lit only by its own
 * fixtures and city lights passing below.
 *
 * A real low orbit is about 92 minutes. That is far too slow to show anyone, so
 * time is compressed to ORBIT_SECONDS and labelled as compressed wherever it is
 * surfaced. No ephemeris, no real trajectory, and the station's position over
 * the ground is not modelled.
 */
export const ORBIT_SECONDS = 210

/** Unit vector from the station toward the planet's centre. */
const EARTH_DIR: [number, number, number] = [0, -0.62, 0.785]
/** Station zenith: straight up, away from the planet. */
const ZENITH: [number, number, number] = [-EARTH_DIR[0], -EARTH_DIR[1], -EARTH_DIR[2]]
/** The orbital direction, perpendicular to the zenith. */
const ALONG: [number, number, number] = [1, 0, 0]

/** Sun direction at an orbital phase, pointing from the station toward the sun. */
function sunAt(phase: number): [number, number, number] {
  const c = Math.cos(phase)
  const sn = Math.sin(phase)
  const v: [number, number, number] = [
    ZENITH[0] * c + ALONG[0] * sn,
    ZENITH[1] * c + ALONG[1] * sn,
    ZENITH[2] * c + ALONG[2] * sn,
  ]
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * How much of the sun the station itself sees, 0 at full night. Used to fade
 * the interior sunlight out as the vessel crosses into the planet's shadow.
 */
function daylight(phase: number): number {
  const s = sunAt(phase)
  const d = s[0] * ZENITH[0] + s[1] * ZENITH[1] + s[2] * ZENITH[2]
  return Math.max(0, Math.min(1, (d + 0.12) / 0.5))
}

function compile(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('Could not create shader')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? 'unknown'
    gl.deleteShader(sh)
    throw new Error(`${label} shader failed to compile: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string, label: string): WebGLProgram {
  const p = gl.createProgram()
  if (!p) throw new Error('Could not create program')
  const v = compile(gl, gl.VERTEX_SHADER, vs, label)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs, label)
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${label} program failed to link: ${gl.getProgramInfoLog(p)}`)
  return p
}

/**
 * Draws the vessel interior.
 *
 * Four passes: a depth-only pass from the sun into a shadow map, the sky and
 * planet as a full-screen triangle with depth writes off so it is visible only
 * through the cupola panes, the lit structure, and the emissive surfaces added
 * over the top. Geometry and the shadow map are built once; a frame allocates
 * nothing.
 */
export class DeckRenderer {
  private gl: WebGL2RenderingContext
  private skyProg: WebGLProgram
  private sceneProg: WebGLProgram
  private emisProg: WebGLProgram
  private depthProg: WebGLProgram
  private emptyVao: WebGLVertexArrayObject | null
  private structVao: WebGLVertexArrayObject | null
  private emisVao: WebGLVertexArrayObject | null
  private depthVao: WebGLVertexArrayObject | null
  private structBuf: WebGLBuffer | null
  private emisBuf: WebGLBuffer | null
  private shadowFbo: WebGLFramebuffer | null = null
  private shadowTex: WebGLTexture | null = null
  private compProg: WebGLProgram
  private backProg: WebGLProgram
  private backVao: WebGLVertexArrayObject | null
  private backBuf: WebGLBuffer | null
  private backCount: number
  private skyFbo: WebGLFramebuffer | null = null
  private skyTex: WebGLTexture | null = null
  private skyW = 0
  private skyH = 0
  private structCount: number
  private emisCount: number
  private hatchCount: number
  private extCount: number
  private hatchVao: WebGLVertexArrayObject | null
  private extVao: WebGLVertexArrayObject | null
  private hatchBuf: WebGLBuffer | null
  private extBuf: WebGLBuffer | null
  private readonly ident: Mat4 = new Float32Array(16)
  private readonly model: Mat4 = new Float32Array(16)
  private lost = false
  private shadowDrawn = false
  /** Orbital phase the shadow map was last drawn for. */
  private shadowPhase = -99
  private q: Quality = QUALITY.high
  private shadowSize = 0
  /** Set when the cupola is outside the view: the planet pass is then skipped. */
  private skySkipped = false
  /** Pixels the planet pass was allowed to touch this frame, for diagnostics. */
  private skyPixels = 0

  private proj: Mat4 = new Float32Array(16)
  private view: Mat4 = new Float32Array(16)
  private viewProj: Mat4 = new Float32Array(16)
  private lightViewProj: Mat4 = new Float32Array(16)
  private lightPos: Float32Array
  private lightCol: Float32Array
  private lightCount: number

  private u: Record<string, Record<string, WebGLUniformLocation | null>> = {}

  private readonly onLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.gl = gl
    canvas.addEventListener('webglcontextlost', this.onLost)

    this.skyProg = link(gl, SKY_VERT, SKY_FRAG, 'Sky')
    this.sceneProg = link(gl, SCENE_VERT, SCENE_FRAG, 'Scene')
    this.emisProg = link(gl, SCENE_VERT, EMISSIVE_FRAG, 'Emissive')
    this.depthProg = link(gl, DEPTH_VERT, DEPTH_FRAG, 'Depth')
    this.compProg = link(gl, SKY_VERT, SKY_COMPOSITE_FRAG, 'Sky composite')
    this.backProg = link(gl, BACKSTOP_VERT, BACKSTOP_FRAG, 'Backstop')

    for (const [name, prog, names] of [
      ['sky', this.skyProg, ['uRight', 'uUp', 'uFwd', 'uAspect', 'uTanHalfFov', 'uTime', 'uEarthDir', 'uEarthDist', 'uEarthR', 'uSunDir', 'uOct']],
      ['scene', this.sceneProg, ['uViewProj', 'uLightViewProj', 'uModel', 'uLightPos', 'uLightCol', 'uLightCount', 'uEye', 'uAlert', 'uSunDir', 'uSunCol', 'uShadow', 'uShadowTexel', 'uEarthTint', 'uCupola', 'uPcf', 'uMaxLights', 'uDetailRange']],
      ['emis', this.emisProg, ['uViewProj', 'uLightViewProj', 'uModel', 'uTime', 'uAlert']],
      ['depth', this.depthProg, ['uLightViewProj', 'uModel']],
      ['comp', this.compProg, ['uSky']],
      ['back', this.backProg, ['uViewProj']],
    ] as const) {
      this.u[name] = {}
      for (const n of names) this.u[name][n] = gl.getUniformLocation(prog, n)
    }

    const structure = buildStructure()
    const emissive = buildEmissive()
    const hatch = buildHatches()
    const backstop = buildBackstop()
    const outside = buildExterior()
    this.structCount = structure.count
    this.emisCount = emissive.count
    this.hatchCount = hatch.count
    this.backCount = backstop.count
    this.extCount = outside.count
    this.structBuf = gl.createBuffer()
    this.emisBuf = gl.createBuffer()
    this.hatchBuf = gl.createBuffer()
    this.backBuf = gl.createBuffer()
    this.extBuf = gl.createBuffer()
    this.structVao = this.makeVao(structure, this.structBuf)
    this.emisVao = this.makeVao(emissive, this.emisBuf)
    this.hatchVao = this.makeVao(hatch, this.hatchBuf)
    this.backVao = this.makeDepthVao(this.backBuf)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.backBuf)
    gl.bufferData(gl.ARRAY_BUFFER, backstop.vertices, gl.STATIC_DRAW)
    this.extVao = this.makeVao(outside, this.extBuf)
    this.depthVao = this.makeDepthVao(this.structBuf)
    this.emptyVao = gl.createVertexArray()
    identity(this.ident)

    this.setQuality('high')

    // Scratch for the per-frame specular selection. Four is the shader's limit
    // and the arrays are reused, so a frame still allocates nothing.
    this.lightPos = new Float32Array(SPECULAR_LIGHTS * 3)
    this.lightCol = new Float32Array(SPECULAR_LIGHTS * 3)
    this.lightCount = 0

    gl.enable(gl.DEPTH_TEST)
    // Deliberately double-sided, and this was tested rather than assumed.
    // Culling back faces measured 21% off the interior pass, but orientFaces
    // can only correct a face where one side is walkable and the other is not;
    // at module junctions both sides are, so those keep whatever winding they
    // were built with and culling deletes them. A ship with holes in it is not
    // worth 21%. The resolution scaling below is a bigger lever and is safe.
    gl.disable(gl.CULL_FACE)
    gl.clearColor(0, 0, 0, 1)
  }

  /**
   * Apply a preset. Only the shadow map needs reallocating; everything else is
   * a uniform, and the frame resolution is handled by the caller through
   * resize, so switching quality never rebuilds geometry.
   */
  setQuality(name: QualityName): void {
    const next = QUALITY[name]
    this.q = next
    if (next.shadowSize !== this.shadowSize) {
      this.shadowSize = next.shadowSize
      this.setupShadow()
      this.shadowDrawn = false
    }
    // skyScale differs per preset, so the offscreen planet target is stale.
    this.skyW = this.skyH = 0
  }

  get quality(): Quality {
    return this.q
  }

  /**
   * Backing-store size for a given CSS size: a fraction of the display's own
   * pixels, reduced further only if that would exceed the preset's ceiling.
   */
  bufferSize(cssW: number, cssH: number, dpr: number): [number, number] {
    const f = this.q.nativeFraction
    let w = cssW * dpr * f
    let h = cssH * dpr * f
    const total = w * h
    if (total > this.q.maxPixels) {
      const k = Math.sqrt(this.q.maxPixels / total)
      w *= k
      h *= k
    }
    return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))]
  }

  /**
   * The offscreen target the planet is drawn into, sized to a fraction of the
   * frame. Reallocated only when that size actually changes, so walking around
   * never touches it; a preset change or a resize does.
   */
  private setupSky(w: number, h: number): void {
    if (w === this.skyW && h === this.skyH && this.skyFbo) return
    const gl = this.gl
    if (this.skyFbo) gl.deleteFramebuffer(this.skyFbo)
    if (this.skyTex) gl.deleteTexture(this.skyTex)
    this.skyW = w
    this.skyH = h
    this.skyTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.skyTex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.skyFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.skyTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private setupShadow(): void {
    const gl = this.gl
    if (this.shadowFbo) gl.deleteFramebuffer(this.shadowFbo)
    if (this.shadowTex) gl.deleteTexture(this.shadowTex)
    this.shadowFbo = null
    this.shadowTex = null
    if (this.shadowSize === 0) {
      this.computeLightMatrix()
      return
    }
    this.shadowTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)
    this.shadowFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.computeLightMatrix()
  }

  /** The sun only reaches the command module, so the map covers that volume. */
  private computeLightMatrix(sun: [number, number, number] = sunAt(0)): void {
    const cmd = ROOMS[1]
    const target: [number, number, number] = [CUPOLA.x, 1.3, cmd.z0 + 2]
    const eye: [number, number, number] = [target[0] + sun[0] * 18, target[1] + sun[1] * 18, target[2] + sun[2] * 18]
    const lv = lookAt(eye, target, [0, 1, 0])
    const lp = orthographic(-8.5, 8.5, -5.5, 5.5, 0.5, 42)
    multiply(lp, lv, this.lightViewProj)
  }

  private makeVao(mesh: MeshData, buf: WebGLBuffer | null): WebGLVertexArrayObject | null {
    const gl = this.gl
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW)
    const stride = FLOATS_PER_VERTEX * 4
    for (const [loc, size, off] of [
      [0, 3, 0],
      [1, 3, 3 * 4],
      [2, 3, 6 * 4],
      [3, 3, 9 * 4],
      [4, 3, 12 * 4],
    ] as const) {
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off)
    }
    gl.bindVertexArray(null)
    return vao
  }

  /** Position-only binding of the structure buffer, for the shadow pass. */
  private makeDepthVao(buf: WebGLBuffer | null): WebGLVertexArrayObject | null {
    const gl = this.gl
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0)
    gl.bindVertexArray(null)
    return vao
  }

  get triangles(): number {
    return (this.structCount + this.emisCount + this.hatchCount * 2) / 3
  }

  /** Triangles in the exterior mesh, drawn only while outside. */
  get exteriorTriangles(): number {
    return this.extCount / 3
  }

  /** For the diagnostics readout: was the planet pass skipped this frame? */
  get planetSkipped(): boolean {
    return this.skySkipped
  }

  /**
   * The aperture rectangle, exposed for the hull-integrity test.
   *
   * That test clears the frame to a colour nothing in the vessel uses and
   * looks for it surviving, which finds any gap you could see space through.
   * The cupola and an open hatch are deliberate gaps, so the test has to know
   * where they are, and the only correct answer is the one the renderer uses
   * itself.
   */
  apertureBox(f: DeckFrame, w: number, h: number): [number, number, number, number] | null {
    if (this.aperture(f) === null) return [0, 0, 0, 0]
    return this.cupolaScissor(f, w, h)
  }

  /** Pixels the planet pass was scissored to this frame. */
  get planetPixels(): number {
    return this.skyPixels
  }

  resize(widthPx: number, heightPx: number): void {
    if (this.canvas.width !== widthPx) this.canvas.width = widthPx
    if (this.canvas.height !== heightPx) this.canvas.height = heightPx
  }

  /**
   * Is the cupola worth drawing a planet for?
   *
   * The planet shader is a full-screen pass evaluating around thirty octaves
   * of noise per pixel, and in most of the vessel not one of those pixels
   * survives to be seen. This answers cheaply and conservatively: never from
   * one of the side modules, where the structure blocks the view outright, and
   * otherwise only when the cupola's bounding sphere falls inside the view
   * cone. The saving could not be isolated on the software rasteriser
   * available here, where interior fill dominates instead; it is kept because
   * skipping a pass whose every pixel is overdrawn is right regardless.
   */
  private cupolaVisible(f: DeckFrame): boolean {
    const [ex, ey, ez] = f.eye
    // The side modules have no line of sight to the bow at all.
    if (Math.abs(ex) > 2.4 && ez < 14) return false

    const dx = CUPOLA.x - ex
    const dy = CUPOLA.y - ey
    const dz = CUPOLA.z - ez
    const dist = Math.hypot(dx, dy, dz)
    if (dist < CUPOLA.radius * 1.5) return true
    const fwd = forward(f.yaw, f.pitch)
    const cos = (dx * fwd[0] + dy * fwd[1] + dz * fwd[2]) / dist
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)))
    // Half the diagonal field of view, plus the cupola's angular size, plus a
    // margin so it is never skipped while sliding into frame.
    const half = Math.atan(Math.tan(FOV / 2) * 1.8)
    return ang < half + Math.asin(Math.min(1, (CUPOLA.radius * 1.4) / dist)) + 0.12
  }

  /**
   * The screen rectangle the cupola aperture can possibly cover.
   *
   * Depth-testing the sky pass is correct but it is not sufficient: whether it
   * saves anything depends on the implementation rejecting a fragment before
   * running its shader, and measuring here showed the software rasteriser does
   * not — the planet still cost 1482 ms of a 3050 ms frame in the spine, where
   * it is visible through a few per cent of the screen. Rather than trust an
   * early-depth optimisation that cannot be verified from here, this clips the
   * pass with a scissor rectangle, which no implementation is free to ignore.
   *
   * The box is the projection of a sphere enclosing the aperture, so it is
   * conservative: it is never smaller than the panes. It gives up and returns
   * the whole viewport whenever the camera is close enough to be inside that
   * sphere, or any corner falls behind the eye, because in both cases the
   * projection is not a bounding box any more.
   *
   * Returns null for the full viewport.
   */
  private cupolaScissor(f: DeckFrame, w: number, h: number): [number, number, number, number] | null {
    const ap = this.aperture(f)
    if (!ap) return null
    const [ax, ay, az, r] = ap
    const dx = ax - f.eye[0]
    const dy = ay - f.eye[1]
    const dz = az - f.eye[2]
    if (dx * dx + dy * dy + dz * dz < r * r * 2.5) return null

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const m = this.viewProj
    for (let i = 0; i < 8; i++) {
      const px = ax + (i & 1 ? r : -r)
      const py = ay + (i & 2 ? r : -r)
      const pz = az + (i & 4 ? r : -r)
      const cw = m[3] * px + m[7] * py + m[11] * pz + m[15]
      if (cw <= 1e-4) return null
      const cx = (m[0] * px + m[4] * py + m[8] * pz + m[12]) / cw
      const cy = (m[1] * px + m[5] * py + m[9] * pz + m[13]) / cw
      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy
    }
    // NDC to pixels, with a pixel of slack so the edge is never clipped short.
    const x0 = Math.max(0, Math.floor(((minX + 1) / 2) * w) - 2)
    const y0 = Math.max(0, Math.floor(((minY + 1) / 2) * h) - 2)
    const x1 = Math.min(w, Math.ceil(((maxX + 1) / 2) * w) + 2)
    const y1 = Math.min(h, Math.ceil(((maxY + 1) / 2) * h) + 2)
    if (x1 <= x0 || y1 <= y0) return [0, 0, 0, 0]
    if (x0 === 0 && y0 === 0 && x1 === w && y1 === h) return null
    return [x0, y0, x1 - x0, y1 - y0]
  }

  /**
   * The opening the sky can be seen through from here, if any.
   *
   * Normally the cupola. While the outer hatch is open it is the hatch
   * instead, because a crew member standing in the crew lock with it open is
   * looking straight out at the planet — and before this, they were looking at
   * a black rectangle, which is a worse answer than either.
   */
  private aperture(f: DeckFrame): [number, number, number, number] | null {
    const d = DOOR_BY_ID['outer-hatch']
    if (d && (f.hatches?.outer ?? 0) > 0.3 && f.eye[0] < d.at + 5) {
      return [d.at, 1.2, (d.lo + d.hi) / 2, (d.hi - d.lo) / 2 + 0.3]
    }
    if (this.cupolaVisible(f)) return [CUPOLA.x, CUPOLA.y, CUPOLA.z, CUPOLA.radius + 0.35]
    return null
  }

  /**
   * The fixtures nearest the eye, for the specular highlight.
   *
   * Only the highlight is left to do per pixel, and a highlight is a local
   * thing: it appears on the surface a metre or two from the viewer and the
   * fixture above them. A fixture thirty metres aft cannot put one anywhere
   * the viewer can see, so there is no reason to send it. A partial selection
   * sort over two dozen fixtures for the best four is a few hundred
   * comparisons, which is nothing next to what it saves per pixel.
   */
  private selectFixtures(eye: [number, number, number]): void {
    const n = FIXTURES.length
    const best: number[] = []
    const bestD: number[] = []
    for (let i = 0; i < n; i++) {
      const p = FIXTURES[i].p
      const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2]
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 > 90) continue
      let at = best.length
      while (at > 0 && bestD[at - 1] > d2) at--
      if (at >= SPECULAR_LIGHTS) continue
      best.splice(at, 0, i)
      bestD.splice(at, 0, d2)
      if (best.length > SPECULAR_LIGHTS) {
        best.pop()
        bestD.pop()
      }
    }
    for (let k = 0; k < best.length; k++) {
      const f = FIXTURES[best[k]]
      this.lightPos[k * 3] = f.p[0]
      this.lightPos[k * 3 + 1] = f.p[1]
      this.lightPos[k * 3 + 2] = f.p[2]
      this.lightCol[k * 3] = f.c[0]
      this.lightCol[k * 3 + 1] = f.c[1]
      this.lightCol[k * 3 + 2] = f.c[2]
    }
    this.lightCount = best.length
  }

  /**
   * Where a hatch leaf is, at a given opening fraction.
   *
   * The leaf is built once along its own +x, from the hinge across the
   * opening, with +z as its thickness. Both hatches sit in walls of constant
   * x, so closed means the leaf's +x runs along world z and its thickness
   * along world x; opening rotates both about the vertical through the hinge.
   * Writing the three basis vectors out directly is clearer here than
   * composing translate-rotate-translate, and it is the part that has to be
   * right for the leaf to meet its frame.
   */
  private hatchMatrix(id: string, open: number): void {
    const d = DOOR_BY_ID[id]
    const m = this.model
    if (!d) {
      identity(m)
      return
    }
    // Hinge on the swing side; the leaf runs from there across the opening.
    const pivotZ = d.swing > 0 ? d.hi : d.lo
    const dz = -d.swing
    // Both leaves swing into the chamber, which is how a pressure hatch is
    // hung: cabin pressure holds it against its seat rather than off it.
    const ang = Math.max(0, Math.min(1, open)) * (Math.PI / 2)
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    const sx = d.swing > 0 ? -1 : 1
    // column 0: the leaf's own +x, across the opening and swinging out of it
    m[0] = sx * sn; m[1] = 0; m[2] = dz * c; m[3] = 0
    // column 1: up
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0
    // column 2: the leaf's thickness, normal to it
    m[8] = sx * c; m[9] = 0; m[10] = -dz * sn; m[11] = 0
    // column 3: the hinge
    m[12] = d.at; m[13] = 0; m[14] = pivotZ; m[15] = 1
  }

  /** Redrawn whenever the sun has moved far enough to matter. */
  private drawShadow(): void {
    const gl = this.gl
    if (!this.shadowFbo) return
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.viewport(0, 0, this.shadowSize, this.shadowSize)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.useProgram(this.depthProg)
    gl.uniformMatrix4fv(this.u.depth.uLightViewProj, false, this.lightViewProj)
    gl.uniformMatrix4fv(this.u.depth.uModel, false, this.ident)
    gl.bindVertexArray(this.depthVao)
    gl.drawArrays(gl.TRIANGLES, 0, this.structCount)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.shadowDrawn = true
  }

  render(f: DeckFrame): void {
    if (this.lost) return
    const gl = this.gl
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    if (w === 0 || h === 0) return
    // Where the sun is this frame, and whether the station is in daylight.
    const phase = (f.time / ORBIT_SECONDS) * Math.PI * 2
    const sun = sunAt(phase)
    const day = daylight(phase)

    // The shadow map follows the sun, but it does not need to be redrawn every
    // frame: a couple of degrees of movement is invisible in a soft shadow, and
    // at this orbital rate that is roughly one depth pass a second.
    if (!this.shadowDrawn || Math.abs(phase - this.shadowPhase) > 0.03) {
      this.computeLightMatrix(sun)
      this.drawShadow()
      this.shadowPhase = phase
    }
    const aspect = w / h

    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    const outside = f.mode === 'exterior'
    // Outside, the far plane has to reach the ends of the arrays and the limb
    // beyond them; inside, a short range keeps depth precision on the detail
    // a crew member is standing next to.
    perspective(FOV, aspect, outside ? 0.08 : 0.04, outside ? 900 : 200, this.proj)
    fpsView(f.eye[0], f.eye[1], f.eye[2], f.yaw, f.pitch, this.view)
    multiply(this.proj, this.view, this.viewProj)

    // ---- lit structure
    //
    // Drawn first, before the sky. The planet used to come first with the
    // depth test off, which meant its shader — several dozen octaves of noise
    // per pixel — ran over the whole frame and was then almost entirely
    // painted over by the interior. Measured at 1493 ms of a 5679 ms frame
    // standing in the spine, for a view in which the cupola panes cover a few
    // per cent of the screen. Now the interior lays down depth first and the
    // planet pass runs only where nothing was drawn, which is exactly the
    // open panes.
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    this.selectFixtures(f.eye)
    gl.useProgram(this.sceneProg)
    const cu = this.u.scene
    gl.uniformMatrix4fv(cu.uViewProj, false, this.viewProj)
    gl.uniformMatrix4fv(cu.uLightViewProj, false, this.lightViewProj)
    gl.uniform3fv(cu.uLightPos, this.lightPos)
    gl.uniform3fv(cu.uLightCol, this.lightCol)
    gl.uniform1i(cu.uLightCount, this.lightCount)
    gl.uniform3f(cu.uEye, f.eye[0], f.eye[1], f.eye[2])
    gl.uniform1f(cu.uAlert, f.alert)
    gl.uniform3f(cu.uSunDir, sun[0], sun[1], sun[2])
    if (outside) {
      // Unfiltered sunlight, and no shadow map: the map covers the command
      // module only, so out here sunShadow would return nothing useful. The
      // uniform is set wide open and the geometry's own normals do the work.
      gl.uniform3f(cu.uSunCol, 2.5 * day, 2.44 * day, 2.3 * day)
    } else if (this.shadowSize === 0) {
      gl.uniform3f(cu.uSunCol, 0, 0, 0)
    } else {
      gl.uniform3f(cu.uSunCol, 3.4 * day, 3.26 * day, 3.0 * day)
    }
    // Light bouncing off the planet and in through the cupola. It follows the
    // lit fraction of the disc rather than the station's own daylight, so the
    // cabin keeps a faint blue wash right up to the terminator and only goes
    // to the fixtures alone once the ground below is dark too.
    const base = this.shadowSize === 0 ? 0.26 : 0.09
    const tint = base * (0.18 + 0.82 * day)
    gl.uniform3f(cu.uEarthTint, tint, tint * 1.65, tint * 2.6)
    gl.uniform3f(cu.uCupola, CUPOLA.x, CUPOLA.y, CUPOLA.z)
    gl.uniform1f(cu.uShadowTexel, 1 / Math.max(1, this.shadowSize))
    gl.uniform1i(cu.uPcf, this.q.pcf)
    gl.uniform1i(cu.uMaxLights, this.q.maxLights)
    gl.uniform1f(cu.uDetailRange, this.q.detailRange)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.uniform1i(cu.uShadow, 0)
    gl.uniformMatrix4fv(cu.uModel, false, this.ident)
    if (outside) {
      gl.bindVertexArray(this.extVao)
      gl.drawArrays(gl.TRIANGLES, 0, this.extCount)
    } else {
      gl.bindVertexArray(this.structVao)
      gl.drawArrays(gl.TRIANGLES, 0, this.structCount)
    }

    // ---- the hatch leaves, each on its own hinge
    //
    // The only geometry in the vessel with a transform. The angle comes from
    // the same airlock state that decides whether a crew member can walk
    // through the opening, so the leaf is never shut against someone who can
    // pass or open in front of someone who cannot.
    if (!outside && f.hatches) {
      gl.bindVertexArray(this.hatchVao)
      for (const [id, open] of [['inner-hatch', f.hatches.inner], ['outer-hatch', f.hatches.outer]] as const) {
        this.hatchMatrix(id, open)
        gl.uniformMatrix4fv(cu.uModel, false, this.model)
        gl.drawArrays(gl.TRIANGLES, 0, this.hatchCount)
      }
      gl.uniformMatrix4fv(cu.uModel, false, this.ident)
    }

    // ---- backstop: last of the opaque passes, so the depth test has the
    // whole interior in front of it. On hardware with early depth rejection
    // this costs essentially nothing; on one without it, the flat shader
    // keeps it cheap anyway.
    if (!outside) {
      gl.useProgram(this.backProg)
      gl.uniformMatrix4fv(this.u.back.uViewProj, false, this.viewProj)
      gl.bindVertexArray(this.backVao)
      gl.drawArrays(gl.TRIANGLES, 0, this.backCount)
    }

    // ---- emissive, added
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.depthMask(false)
    gl.useProgram(this.emisProg)
    const eu = this.u.emis
    gl.uniformMatrix4fv(eu.uViewProj, false, this.viewProj)
    gl.uniformMatrix4fv(eu.uLightViewProj, false, this.lightViewProj)
    gl.uniformMatrix4fv(eu.uModel, false, this.ident)
    gl.uniform1f(eu.uTime, f.time)
    gl.uniform1f(eu.uAlert, f.alert)
    if (!outside) {
      gl.bindVertexArray(this.emisVao)
      gl.drawArrays(gl.TRIANGLES, 0, this.emisCount)
    }
    gl.disable(gl.BLEND)

    // ---- sky and planet, through whatever the interior left open
    //
    // The sky triangle is emitted at the far plane, so with the depth test on
    // and depth writes off it survives only where the interior wrote nothing.
    // Those pixels are the cupola panes and the view past the limb.
    this.skySkipped = outside ? false : this.aperture(f) === null
    const box = outside || this.skySkipped ? null : this.cupolaScissor(f, w, h)
    this.skyPixels = box ? box[2] * box[3] : this.skySkipped ? 0 : w * h
    if (!this.skySkipped && this.skyPixels > 0) {
      const ss = this.q.skyScale
      const sw = Math.max(16, Math.round(w * ss))
      const sh = Math.max(16, Math.round(h * ss))
      this.setupSky(sw, sh)
      this.skyPixels = Math.round(this.skyPixels * ss * ss)

      // Planet into the smaller target, clipped to the aperture's share of it.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo)
      gl.viewport(0, 0, sw, sh)
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      if (box) {
        gl.enable(gl.SCISSOR_TEST)
        gl.scissor(
          Math.floor(box[0] * ss), Math.floor(box[1] * ss),
          Math.ceil(box[2] * ss) + 1, Math.ceil(box[3] * ss) + 1,
        )
      }
      gl.useProgram(this.skyProg)
      gl.bindVertexArray(this.emptyVao)
      const fwd = forward(f.yaw, f.pitch)
      const right: [number, number, number] = [Math.cos(f.yaw), 0, -Math.sin(f.yaw)]
      const up: [number, number, number] = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ]
      const su = this.u.sky
      gl.uniform3f(su.uRight, right[0], right[1], right[2])
      gl.uniform3f(su.uUp, -up[0], -up[1], -up[2])
      gl.uniform3f(su.uFwd, fwd[0], fwd[1], fwd[2])
      gl.uniform1f(su.uAspect, aspect)
      gl.uniform1f(su.uTanHalfFov, Math.tan(FOV / 2))
      gl.uniform1f(su.uTime, f.time)
      // Units of 1000 km. The planet sits off the bow and below, so looking
      // forward through the cupola puts the limb across the upper panes and
      // the ground across the lower ones, which is the cupola view.
      gl.uniform3f(su.uEarthDir, EARTH_DIR[0], EARTH_DIR[1], EARTH_DIR[2])
      gl.uniform1f(su.uEarthDist, 6.79)
      gl.uniform1f(su.uEarthR, 6.371)
      gl.uniform3f(su.uSunDir, sun[0], sun[1], sun[2])
      gl.uniform1i(su.uOct, this.q.planetOctaves)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // Composite it onto the frame. The sky triangle sits at the far plane,
      // so with depth writes off and LEQUAL this lands only where the interior
      // wrote nothing — the open panes — and the window frames in front of it
      // keep their full-resolution edges.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, w, h)
      if (box) gl.scissor(box[0], box[1], box[2], box[3])
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      gl.useProgram(this.compProg)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.skyTex)
      gl.uniform1i(this.u.comp.uSky, 1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.disable(gl.SCISSOR_TEST)
    }

    gl.depthMask(true)
    gl.depthFunc(gl.LESS)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    const gl = this.gl
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    if (this.structBuf) gl.deleteBuffer(this.structBuf)
    if (this.emisBuf) gl.deleteBuffer(this.emisBuf)
    if (this.hatchBuf) gl.deleteBuffer(this.hatchBuf)
    if (this.backBuf) gl.deleteBuffer(this.backBuf)
    if (this.extBuf) gl.deleteBuffer(this.extBuf)
    if (this.structVao) gl.deleteVertexArray(this.structVao)
    if (this.emisVao) gl.deleteVertexArray(this.emisVao)
    if (this.hatchVao) gl.deleteVertexArray(this.hatchVao)
    if (this.backVao) gl.deleteVertexArray(this.backVao)
    if (this.extVao) gl.deleteVertexArray(this.extVao)
    if (this.depthVao) gl.deleteVertexArray(this.depthVao)
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao)
    if (this.shadowFbo) gl.deleteFramebuffer(this.shadowFbo)
    if (this.shadowTex) gl.deleteTexture(this.shadowTex)
    if (this.skyFbo) gl.deleteFramebuffer(this.skyFbo)
    if (this.skyTex) gl.deleteTexture(this.skyTex)
    gl.deleteProgram(this.compProg)
    gl.deleteProgram(this.backProg)
    gl.deleteProgram(this.skyProg)
    gl.deleteProgram(this.sceneProg)
    gl.deleteProgram(this.emisProg)
    gl.deleteProgram(this.depthProg)
    this.structBuf = this.emisBuf = this.hatchBuf = this.extBuf = this.backBuf = null
    this.structVao = this.emisVao = this.depthVao = this.emptyVao = null
    this.hatchVao = this.extVao = this.backVao = null
    this.shadowFbo = null
    this.shadowTex = null
    this.skyFbo = null
    this.skyTex = null
  }
}

/** Null when WebGL2 is unavailable, so the caller can show the deck plan instead. */
export function createDeckRenderer(canvas: HTMLCanvasElement): DeckRenderer | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    // Multisampling off, deliberately, and this was measured rather than
    // assumed: four samples cost 22 per cent of the frame windowed and 15 per
    // cent at 1440p. Those same pixels buy more as resolution, which sharpens
    // every edge in the frame including the ones inside a rack face, where
    // multisampling does nothing. The preset ladder spends them there instead.
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  if (!gl) return null
  try {
    return new DeckRenderer(canvas, gl)
  } catch (err) {
    console.warn('[flight-deck] Renderer unavailable; falling back to the deck plan.', err)
    return null
  }
}
