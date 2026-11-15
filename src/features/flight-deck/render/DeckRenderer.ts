import { buildEmissive, buildStructure, type MeshData } from './geometry'
import { fpsView, forward, multiply, perspective, type Mat4 } from './mat4'
import { EMISSIVE_FRAG, SCENE_FRAG, SCENE_VERT, SKY_FRAG, SKY_VERT } from './shaders'
import { STATIONS } from '../model/deck'

export interface DeckFrame {
  eye: [number, number, number]
  yaw: number
  pitch: number
  time: number
  /** 0..1. Raised when the mission has an active alert. */
  alert: number
}

const FOV = (72 * Math.PI) / 180

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
 * Three passes, in this order: the sky as a full-screen triangle with depth
 * writes off so it fills the bow aperture and nothing else, the lit structure,
 * then the emissive surfaces added on top. Geometry is built once at
 * construction and never reallocated, so a frame does no allocation at all.
 */
export class DeckRenderer {
  private gl: WebGL2RenderingContext
  private skyProg: WebGLProgram
  private sceneProg: WebGLProgram
  private emisProg: WebGLProgram
  private emptyVao: WebGLVertexArrayObject | null
  private structVao: WebGLVertexArrayObject | null
  private emisVao: WebGLVertexArrayObject | null
  private structBuf: WebGLBuffer | null
  private emisBuf: WebGLBuffer | null
  private structCount: number
  private emisCount: number
  private lost = false

  // Scratch, reused every frame.
  private proj: Mat4 = new Float32Array(16)
  private view: Mat4 = new Float32Array(16)
  private viewProj: Mat4 = new Float32Array(16)
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

    for (const [name, prog, names] of [
      ['sky', this.skyProg, ['uRight', 'uUp', 'uFwd', 'uAspect', 'uTanHalfFov', 'uTime', 'uPlanetDir', 'uPlanetRadius', 'uSunDir']],
      ['scene', this.sceneProg, ['uViewProj', 'uLightPos', 'uLightCol', 'uLightCount', 'uEye', 'uAlert']],
      ['emis', this.emisProg, ['uViewProj', 'uTime', 'uAlert']],
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
    this.emptyVao = gl.createVertexArray()

    // Point lights: one per console screen, plus a run down the spine.
    const pts: number[] = []
    const cols: number[] = []
    for (const s of STATIONS) {
      pts.push(s.x - Math.sin(s.facing) * 0.6, 1.5, s.z - Math.cos(s.facing) * 0.6)
      cols.push(0.2, 0.42, 0.52)
    }
    for (const z of [-11, -4, 3, 10, 17, 22]) {
      pts.push(0, 2.75, z)
      cols.push(0.26, 0.29, 0.34)
    }
    this.lightCount = Math.min(12, cols.length / 3)
    this.lightPos = new Float32Array(pts.slice(0, this.lightCount * 3))
    this.lightCol = new Float32Array(cols.slice(0, this.lightCount * 3))

    gl.enable(gl.DEPTH_TEST)
    // Deliberately double-sided. The interior is built from four wall
    // orientations plus floors and deck-heads, and a single reversed winding
    // would silently delete a wall. The fragment shader flips the normal for
    // back faces, so lighting stays correct without depending on winding.
    gl.disable(gl.CULL_FACE)
    gl.clearColor(0, 0, 0, 1)
  }

  private makeVao(mesh: MeshData, buf: WebGLBuffer | null): WebGLVertexArrayObject | null {
    const gl = this.gl
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW)
    const stride = 9 * 4
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 6 * 4)
    gl.bindVertexArray(null)
    return vao
  }

  /** Triangle count, for the diagnostics readout. */
  get triangles(): number {
    return (this.structCount + this.emisCount) / 3
  }

  resize(widthPx: number, heightPx: number): void {
    if (this.canvas.width !== widthPx) this.canvas.width = widthPx
    if (this.canvas.height !== heightPx) this.canvas.height = heightPx
  }

  render(f: DeckFrame): void {
    if (this.lost) return
    const gl = this.gl
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    if (w === 0 || h === 0) return
    const aspect = w / h

    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    perspective(FOV, aspect, 0.05, 220, this.proj)
    fpsView(f.eye[0], f.eye[1], f.eye[2], f.yaw, f.pitch, this.view)
    multiply(this.proj, this.view, this.viewProj)

    // ---- sky, behind everything
    gl.depthMask(false)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(this.skyProg)
    gl.bindVertexArray(this.emptyVao)
    const fwd = forward(f.yaw, f.pitch)
    // Right and up derived from the same yaw/pitch so the sky tracks the view.
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
    // The destination sits off the bow, a little to port and below the horizon.
    gl.uniform3f(su.uPlanetDir, -0.42, 0.02, 0.907)
    gl.uniform1f(su.uPlanetRadius, 0.3)
    gl.uniform3f(su.uSunDir, 0.55, 0.42, 0.72)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // ---- lit structure
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.useProgram(this.sceneProg)
    const cu = this.u.scene
    gl.uniformMatrix4fv(cu.uViewProj, false, this.viewProj)
    gl.uniform3fv(cu.uLightPos, this.lightPos)
    gl.uniform3fv(cu.uLightCol, this.lightCol)
    gl.uniform1i(cu.uLightCount, this.lightCount)
    gl.uniform3f(cu.uEye, f.eye[0], f.eye[1], f.eye[2])
    gl.uniform1f(cu.uAlert, f.alert)
    gl.bindVertexArray(this.structVao)
    gl.drawArrays(gl.TRIANGLES, 0, this.structCount)

    // ---- emissive, added
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.depthMask(false)
    gl.useProgram(this.emisProg)
    const eu = this.u.emis
    gl.uniformMatrix4fv(eu.uViewProj, false, this.viewProj)
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
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao)
    gl.deleteProgram(this.skyProg)
    gl.deleteProgram(this.sceneProg)
    gl.deleteProgram(this.emisProg)
    this.structBuf = this.emisBuf = null
    this.structVao = this.emisVao = this.emptyVao = null
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
