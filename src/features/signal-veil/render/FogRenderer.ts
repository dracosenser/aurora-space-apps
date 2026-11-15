import type { WipeMask } from '../model/wipeMask'
import { FOG_FRAGMENT_SHADER, FOG_VERTEX_SHADER } from './shaders'

/**
 * The fog surface draws the visor condensation over the constellation.
 * Two implementations share one interface:
 *   - WebGL2: the full procedural shader (see shaders.ts).
 *   - Canvas 2D: a simpler, still procedural and still wipeable fallback for
 *     environments without WebGL2.
 */

export interface FogFrame {
  /** Seconds. Hold constant for reduced motion. */
  time: number
  /** 1 = fully fogged, 0 = dissolved. */
  fogAmount: number
  lens: { x: number; y: number; radius: number; on: boolean }
  pointer: { x: number; y: number }
}

export interface FogSurface {
  readonly kind: 'webgl2' | 'canvas2d'
  resize(widthPx: number, heightPx: number): void
  render(scene: HTMLCanvasElement, mask: WipeMask, frame: FogFrame): void
  dispose(): void
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error'
    gl.deleteShader(shader)
    throw new Error(`Fog shader failed to compile: ${log}`)
  }
  return shader
}

class WebGLFogSurface implements FogSurface {
  readonly kind = 'webgl2' as const
  private gl: WebGL2RenderingContext
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private sceneTex: WebGLTexture | null = null
  private maskTex: WebGLTexture | null = null
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private maskVersion = -1
  private maskSize = ''
  private lost = false
  private readonly onLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
  }
  private readonly onRestored = () => {
    this.lost = false
    this.init()
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.gl = gl
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    this.init()
  }

  private init(): void {
    const gl = this.gl
    const vs = compile(gl, gl.VERTEX_SHADER, FOG_VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FOG_FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!program) throw new Error('Could not create program')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Fog program failed to link: ${gl.getProgramInfoLog(program)}`)
    this.program = program
    this.vao = gl.createVertexArray()
    for (const name of ['uScene', 'uMask', 'uRes', 'uTime', 'uFog', 'uLens', 'uPointer']) this.uniforms[name] = gl.getUniformLocation(program, name)

    this.sceneTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.maskTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.maskVersion = -1
    this.maskSize = ''

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.clearColor(0, 0, 0, 0)
  }

  resize(widthPx: number, heightPx: number): void {
    if (this.canvas.width !== widthPx) this.canvas.width = widthPx
    if (this.canvas.height !== heightPx) this.canvas.height = heightPx
  }

  render(scene: HTMLCanvasElement, mask: WipeMask, frame: FogFrame): void {
    if (this.lost || !this.program) return
    const gl = this.gl
    if (scene.width === 0 || scene.height === 0) return
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    // The live constellation, with mips for the frosted blur.
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene)
    gl.generateMipmap(gl.TEXTURE_2D)

    // The wipe mask, uploaded only when it has changed.
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex)
    if (mask.version !== this.maskVersion) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      const size = `${mask.cols}x${mask.rows}`
      if (size !== this.maskSize) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.cols, mask.rows, 0, gl.RED, gl.UNSIGNED_BYTE, mask.data)
        this.maskSize = size
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mask.cols, mask.rows, gl.RED, gl.UNSIGNED_BYTE, mask.data)
      }
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
      this.maskVersion = mask.version
    }

    const u = this.uniforms
    gl.uniform1i(u.uScene, 0)
    gl.uniform1i(u.uMask, 1)
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.uniform1f(u.uTime, frame.time)
    gl.uniform1f(u.uFog, frame.fogAmount)
    gl.uniform4f(u.uLens, frame.lens.x, frame.lens.y, frame.lens.radius, frame.lens.on ? 1 : 0)
    gl.uniform2f(u.uPointer, frame.pointer.x, frame.pointer.y)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    const gl = this.gl
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    if (this.sceneTex) gl.deleteTexture(this.sceneTex)
    if (this.maskTex) gl.deleteTexture(this.maskTex)
    if (this.vao) gl.deleteVertexArray(this.vao)
    if (this.program) gl.deleteProgram(this.program)
    this.sceneTex = this.maskTex = null
    this.vao = null
    this.program = null
  }
}

/** Deterministic value noise for the fallback fog texture. */
function cellNoise(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

class Canvas2DFogSurface implements FogSurface {
  readonly kind = 'canvas2d' as const
  private ctx: CanvasRenderingContext2D
  private buffer: HTMLCanvasElement
  private bufferCtx: CanvasRenderingContext2D
  private image: ImageData | null = null
  private noise: Float32Array | null = null
  private lastVersion = -1
  private lastFog = -1

  constructor(
    private readonly canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) {
    this.ctx = ctx
    this.buffer = document.createElement('canvas')
    this.bufferCtx = this.buffer.getContext('2d')!
  }

  resize(widthPx: number, heightPx: number): void {
    if (this.canvas.width !== widthPx) this.canvas.width = widthPx
    if (this.canvas.height !== heightPx) this.canvas.height = heightPx
    this.lastVersion = -1
  }

  render(scene: HTMLCanvasElement, mask: WipeMask, frame: FogFrame): void {
    const { cols, rows } = mask
    if (!this.image || this.buffer.width !== cols || this.buffer.height !== rows) {
      this.buffer.width = cols
      this.buffer.height = rows
      this.image = this.bufferCtx.createImageData(cols, rows)
      this.noise = new Float32Array(cols * rows)
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          // Two octaves of cell noise: broad fog variation plus fine bead speckle.
          const broad = cellNoise(i >> 4, j >> 4) * 0.6 + cellNoise(i >> 2, j >> 2) * 0.4
          this.noise[j * cols + i] = 0.8 + broad * 0.2 + (cellNoise(i, j) > 0.93 ? -0.35 : 0)
        }
      }
      this.lastVersion = -1
    }
    const fogKey = Math.round(frame.fogAmount * 200)
    if (mask.version !== this.lastVersion || fogKey !== this.lastFog) {
      const px = this.image.data
      const noise = this.noise!
      for (let k = 0; k < mask.data.length; k++) {
        const a = frame.fogAmount * (1 - mask.data[k] / 255) * noise[k]
        const o = k * 4
        px[o] = 138
        px[o + 1] = 156
        px[o + 2] = 190
        px[o + 3] = Math.max(0, Math.min(255, a * 240))
      }
      this.bufferCtx.putImageData(this.image, 0, 0)
      this.lastVersion = mask.version
      this.lastFog = fogKey
    }
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.buffer, 0, 0, w, h)
    if (frame.lens.on) {
      // A clear magnified disc cut out of the fog.
      const cx = frame.lens.x * w
      const cy = frame.lens.y * h
      const r = frame.lens.radius * h
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.clearRect(cx - r, cy - r, r * 2, r * 2)
      const z = 1.35
      ctx.drawImage(scene, cx - r / z, cy - r / z, (2 * r) / z, (2 * r) / z, cx - r, cy - r, 2 * r, 2 * r)
      ctx.restore()
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(160, 200, 255, 0.85)'
      ctx.lineWidth = Math.max(2, h * 0.004)
      ctx.stroke()
    }
  }

  dispose(): void {
    this.image = null
    this.noise = null
  }
}

/** Create the best available fog surface for a canvas. Set `forceFallback` to test the Canvas 2D path. */
export function createFogSurface(canvas: HTMLCanvasElement, forceFallback = false): FogSurface {
  if (!forceFallback) {
    try {
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
      if (gl) return new WebGLFogSurface(canvas, gl)
    } catch (err) {
      console.warn('[signal-veil] WebGL2 fog unavailable, using Canvas 2D fallback.', err)
    }
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No rendering context available for the fog surface')
  return new Canvas2DFogSurface(canvas, ctx)
}
