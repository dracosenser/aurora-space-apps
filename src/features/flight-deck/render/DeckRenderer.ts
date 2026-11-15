import { FLOATS_PER_VERTEX, axisOf, buildEmissive, buildStructure, type MeshData } from './geometry'
import { fpsView, forward, multiply, orthographic, perspective, lookAt, type Mat4 } from './mat4'
import { DEPTH_FRAG, DEPTH_VERT, EMISSIVE_FRAG, SCENE_FRAG, SCENE_VERT, SKY_FRAG, SKY_VERT } from './shaders'
import { CUPOLA, ROOMS, STATIONS } from '../model/deck'
import { QUALITY, type Quality, type QualityName } from './quality'

export interface DeckFrame {
  eye: [number, number, number]
  yaw: number
  pitch: number
  time: number
  /** 0..1. Raised when the mission has an active alert. */
  alert: number
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
  private structCount: number
  private emisCount: number
  private lost = false
  private shadowDrawn = false
  /** Orbital phase the shadow map was last drawn for. */
  private shadowPhase = -99
  private q: Quality = QUALITY.high
  private shadowSize = 0
  /** Set when the cupola is outside the view: the planet pass is then skipped. */
  private skySkipped = false

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

    for (const [name, prog, names] of [
      ['sky', this.skyProg, ['uRight', 'uUp', 'uFwd', 'uAspect', 'uTanHalfFov', 'uTime', 'uEarthDir', 'uEarthDist', 'uEarthR', 'uSunDir', 'uOct']],
      ['scene', this.sceneProg, ['uViewProj', 'uLightViewProj', 'uLightPos', 'uLightCol', 'uLightCount', 'uEye', 'uAlert', 'uSunDir', 'uSunCol', 'uShadow', 'uShadowTexel', 'uEarthTint', 'uCupola', 'uPcf', 'uMaxLights']],
      ['emis', this.emisProg, ['uViewProj', 'uLightViewProj', 'uTime', 'uAlert']],
      ['depth', this.depthProg, ['uLightViewProj']],
    ] as const) {
      this.u[name] = {}
      for (const n of names) this.u[name][n] = gl.getUniformLocation(prog, n)
    }

    const structure = buildStructure()
    const emissive = buildEmissive()
    this.structCount = structure.count
    this.emisCount = emissive.count
    this.structBuf = gl.createBuffer()
    this.emisBuf = gl.createBuffer()
    this.structVao = this.makeVao(structure, this.structBuf)
    this.emisVao = this.makeVao(emissive, this.emisBuf)
    this.depthVao = this.makeDepthVao(this.structBuf)
    this.emptyVao = gl.createVertexArray()

    this.setQuality('high')

    // Interior fixtures: one light per deck-head run, one per console screen.
    const pts: number[] = []
    const cols: number[] = []
    for (const r of ROOMS) {
      const along = axisOf(r)
      const a0 = along === 'z' ? r.z0 : r.x0
      const a1 = along === 'z' ? r.z1 : r.x1
      const cu = along === 'z' ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2
      const n = Math.max(1, Math.round((a1 - a0) / 5.2))
      for (let i = 0; i < n; i++) {
        const t = a0 + ((a1 - a0) * (i + 0.5)) / n
        pts.push(along === 'z' ? cu : t, r.height - 0.32, along === 'z' ? t : cu)
        // Slightly warm, as fluorescent fixtures in the references read.
        cols.push(0.82, 0.8, 0.74)
      }
    }
    for (const s of STATIONS) {
      pts.push(s.x - Math.sin(s.facing) * 0.55, 1.35, s.z - Math.cos(s.facing) * 0.55)
      cols.push(0.1, 0.21, 0.3)
    }
    this.lightCount = Math.min(16, cols.length / 3)
    this.lightPos = new Float32Array(pts.slice(0, this.lightCount * 3))
    this.lightCol = new Float32Array(cols.slice(0, this.lightCount * 3))

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
    return (this.structCount + this.emisCount) / 3
  }

  /** For the diagnostics readout: was the planet pass skipped this frame? */
  get planetSkipped(): boolean {
    return this.skySkipped
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

  /** Redrawn whenever the sun has moved far enough to matter. */
  private drawShadow(): void {
    const gl = this.gl
    if (!this.shadowFbo) return
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.viewport(0, 0, this.shadowSize, this.shadowSize)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.useProgram(this.depthProg)
    gl.uniformMatrix4fv(this.u.depth.uLightViewProj, false, this.lightViewProj)
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

    perspective(FOV, aspect, 0.04, 200, this.proj)
    fpsView(f.eye[0], f.eye[1], f.eye[2], f.yaw, f.pitch, this.view)
    multiply(this.proj, this.view, this.viewProj)

    // ---- sky and planet, behind everything, and only when it can be seen
    this.skySkipped = !this.cupolaVisible(f)
    if (this.skySkipped) {
      gl.depthMask(true)
      gl.enable(gl.DEPTH_TEST)
    } else {
    gl.depthMask(false)
    gl.disable(gl.DEPTH_TEST)
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
    // forward through the cupola puts the limb across the upper panes and the
    // ground across the lower ones, which is the cupola view.
    gl.uniform3f(su.uEarthDir, EARTH_DIR[0], EARTH_DIR[1], EARTH_DIR[2])
    gl.uniform1f(su.uEarthDist, 6.79)
    gl.uniform1f(su.uEarthR, 6.371)
    gl.uniform3f(su.uSunDir, sun[0], sun[1], sun[2])
    gl.uniform1i(su.uOct, this.q.planetOctaves)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    // ---- lit structure
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
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
    if (this.shadowSize === 0) gl.uniform3f(cu.uSunCol, 0, 0, 0)
    else gl.uniform3f(cu.uSunCol, 3.4 * day, 3.26 * day, 3.0 * day)
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
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.uniform1i(cu.uShadow, 0)
    gl.bindVertexArray(this.structVao)
    gl.drawArrays(gl.TRIANGLES, 0, this.structCount)

    // ---- emissive, added
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.depthMask(false)
    gl.useProgram(this.emisProg)
    const eu = this.u.emis
    gl.uniformMatrix4fv(eu.uViewProj, false, this.viewProj)
    gl.uniformMatrix4fv(eu.uLightViewProj, false, this.lightViewProj)
    gl.uniform1f(eu.uTime, f.time)
    gl.uniform1f(eu.uAlert, f.alert)
    gl.bindVertexArray(this.emisVao)
    gl.drawArrays(gl.TRIANGLES, 0, this.emisCount)

    gl.depthMask(true)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    const gl = this.gl
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    if (this.structBuf) gl.deleteBuffer(this.structBuf)
    if (this.emisBuf) gl.deleteBuffer(this.emisBuf)
    if (this.structVao) gl.deleteVertexArray(this.structVao)
    if (this.emisVao) gl.deleteVertexArray(this.emisVao)
    if (this.depthVao) gl.deleteVertexArray(this.depthVao)
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao)
    if (this.shadowFbo) gl.deleteFramebuffer(this.shadowFbo)
    if (this.shadowTex) gl.deleteTexture(this.shadowTex)
    gl.deleteProgram(this.skyProg)
    gl.deleteProgram(this.sceneProg)
    gl.deleteProgram(this.emisProg)
    gl.deleteProgram(this.depthProg)
    this.structBuf = this.emisBuf = null
    this.structVao = this.emisVao = this.depthVao = this.emptyVao = null
    this.shadowFbo = null
    this.shadowTex = null
  }
}

/** Null when WebGL2 is unavailable, so the caller can show the deck plan instead. */
export function createDeckRenderer(canvas: HTMLCanvasElement): DeckRenderer | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true, powerPreference: 'high-performance' })
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
