import { useEffect, useRef } from 'react'
import type { CategoryDef, IndicatorDef } from '../../engine/types'
import { buildLayout, hitTestNode, type VeilLayout } from './model/layout'
import { PointerController, type PointerEffect } from './model/pointer'
import type { VeilSnapshot } from './model/snapshot'
import { WipeMask } from './model/wipeMask'
import { createFogSurface, type FogSurface } from './render/FogRenderer'
import { SceneRenderer } from './render/SceneRenderer'

export interface LensTarget {
  /** Signal under the lens, or null when it is over empty glass. */
  id: string | null
  /** Lens centre in CSS pixels relative to the canvas. */
  x: number
  y: number
  radius: number
  canvasWidth: number
  canvasHeight: number
}

export interface SignalVeilCanvasProps {
  indicators: readonly IndicatorDef[]
  categories: readonly CategoryDef[]
  /** Per-day visual model built from Constellation Engine results. */
  snapshot: VeilSnapshot
  selectedId: string | null
  connection: { a: string; b: string } | null
  lens: boolean
  /** Brush radius in CSS pixels. */
  brush: number
  /** Change to re-fog the glass. */
  fogEpoch: number
  /** Change to dissolve whatever fog remains. */
  clearEpoch: number
  /** When true the glass starts clear (no fog). */
  startClear?: boolean
  /** Use the Canvas 2D fog even when WebGL2 is available (for testing and low-power devices). */
  forceCanvas2D?: boolean
  onSelect: (id: string | null) => void
  /** The user drew a line between two signals. */
  onConnect: (a: string, b: string) => void
  /** Share of the glass wiped clear, 0–1. */
  onFogProgress?: (revealed: number) => void
  onLensTarget?: (target: LensTarget | null) => void
  /** Reports which fog renderer is in use. */
  onRenderer?: (kind: 'webgl2' | 'canvas2d') => void
  className?: string
  ariaLabel?: string
}

const MAX_DPR = 1.75

/**
 * The SIGNAL VEIL surface: a wipeable fogged visor over the live constellation.
 *
 * Two stacked canvases. The lower one is the crisp 2D constellation. The upper
 * one is the fog pass, which re-uploads the lower canvas as a texture every
 * frame so it can blur and refract it, and is transparent wherever the glass
 * has been wiped. When no fog remains and the lens is off, the fog pass stops.
 */
export function SignalVeilCanvas(props: SignalVeilCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLCanvasElement>(null)
  const fogRef = useRef<HTMLCanvasElement>(null)
  const brushRef = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props

  // Signals from props to the render loop.
  const dirty = useRef(true)
  const fogTarget = useRef(props.startClear ? 0 : 1)
  const resetRequested = useRef(false)

  useEffect(() => {
    dirty.current = true
  }, [props.snapshot, props.selectedId, props.connection, props.lens, props.brush])

  // Epoch signals are compared with their previous value rather than skipped on
  // "first run", so they stay correct when React re-runs effects in StrictMode.
  const seenFogEpoch = useRef(props.fogEpoch)
  useEffect(() => {
    if (seenFogEpoch.current === props.fogEpoch) return
    seenFogEpoch.current = props.fogEpoch
    resetRequested.current = true
    fogTarget.current = 1
    dirty.current = true
  }, [props.fogEpoch])

  const seenClearEpoch = useRef(props.clearEpoch)
  useEffect(() => {
    if (seenClearEpoch.current === props.clearEpoch) return
    seenClearEpoch.current = props.clearEpoch
    fogTarget.current = 0
    dirty.current = true
  }, [props.clearEpoch])

  useEffect(() => {
    const wrap = wrapRef.current
    const sceneCanvas = sceneRef.current
    const fogCanvas = fogRef.current
    if (!wrap || !sceneCanvas || !fogCanvas) return
    const sceneCtx = sceneCanvas.getContext('2d')
    if (!sceneCtx) return

    const scene = new SceneRenderer()
    const mask = new WipeMask()
    let fog: FogSurface | null = null
    try {
      fog = createFogSurface(fogCanvas, !!latest.current.forceCanvas2D)
      latest.current.onRenderer?.(fog.kind)
    } catch (err) {
      console.warn('[signal-veil] Fog surface unavailable; showing the constellation without fog.', err)
    }
    if (latest.current.startClear || !fog) {
      mask.clearAll()
      fogTarget.current = 0
    }

    let width = 0
    let height = 0
    let dpr = 1
    let layout: VeilLayout = buildLayout(latest.current.indicators, latest.current.categories)
    let layoutKey = ''
    let fogAmount = fogTarget.current
    let hoverId: string | null = null
    let drag: { from: string; x: number; y: number; over: string | null } | null = null
    let pointerX = -1
    let pointerY = -1
    let pointerInside = false
    let lastProgressSent = -1
    let lastLensKey = ''
    let raf = 0
    let running = true
    let visible = true
    let last = performance.now()
    let clock = 0

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = reduced.matches
    const onReduced = () => {
      reducedMotion = reduced.matches
      dirty.current = true
    }
    reduced.addEventListener('change', onReduced)

    const hitRadius = () => Math.max(22, Math.min(width, height) * 0.045)
    const isRevealed = (x: number, y: number) => fogAmount < 0.5 || mask.valueAt(x / width, y / height) > 0.5

    const pointer = new PointerController({
      hitNode: (x, y) => hitTestNode(layout, x, y, width, height, hitRadius())?.id ?? null,
      isRevealed,
      lensActive: () => latest.current.lens,
    })

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      const nextDpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      if (w === width && h === height && nextDpr === dpr) return
      width = w
      height = h
      dpr = nextDpr
      sceneCanvas.width = Math.round(w * dpr)
      sceneCanvas.height = Math.round(h * dpr)
      fog?.resize(sceneCanvas.width, sceneCanvas.height)
      layoutKey = ''
      dirty.current = true
    }
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    resize()

    const lensRadius = () => Math.max(64, Math.min(132, Math.min(width, height) * 0.17))

    const reportFog = (force: boolean) => {
      const f = mask.revealedFraction()
      if (force || Math.abs(f - lastProgressSent) > 0.01) {
        lastProgressSent = f
        latest.current.onFogProgress?.(f)
      }
    }

    const apply = (effects: PointerEffect[]) => {
      const p = latest.current
      for (const e of effects) {
        if (e.type === 'wipe') {
          if (fogAmount > 0.02) {
            mask.stroke(e.x0 / width, e.y0 / height, e.x1 / width, e.y1 / height, p.brush / height, width / height)
            reportFog(false)
          }
        } else if (e.type === 'select') {
          p.onSelect(e.id)
        } else if (e.type === 'connect-start') {
          drag = { from: e.from, x: pointerX, y: pointerY, over: null }
        } else if (e.type === 'connect-move') {
          drag = { from: e.from, x: e.x, y: e.y, over: e.over }
        } else if (e.type === 'connect-end') {
          drag = null
          if (e.to) p.onConnect(e.from, e.to)
        }
      }
      dirty.current = true
    }

    const local = (ev: PointerEvent): [number, number] => {
      const rect = fogCanvas.getBoundingClientRect()
      return [ev.clientX - rect.left, ev.clientY - rect.top]
    }

    const updateBrushCursor = () => {
      const el = brushRef.current
      if (!el) return
      const p = latest.current
      const fogHere = pointerInside && !p.lens && fogAmount > 0.5 && !isRevealed(pointerX, pointerY) && pointer.mode !== 'connect'
      if (fogHere || pointer.mode === 'wipe') {
        const d = p.brush * 2
        el.style.opacity = fogAmount > 0.05 ? '1' : '0'
        el.style.width = `${d}px`
        el.style.height = `${d}px`
        el.style.transform = `translate3d(${pointerX - p.brush}px, ${pointerY - p.brush}px, 0)`
      } else {
        el.style.opacity = '0'
      }
    }

    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return
      fogCanvas.setPointerCapture(ev.pointerId)
      const [x, y] = local(ev)
      pointerX = x
      pointerY = y
      pointerInside = true
      apply(pointer.down(x, y))
      updateBrushCursor()
      ev.preventDefault()
    }
    const onMove = (ev: PointerEvent) => {
      // Coalesced events keep fast strokes continuous.
      const events = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : []
      const list = events.length ? events : [ev]
      for (const e of list) {
        const [x, y] = local(e)
        pointerX = x
        pointerY = y
        if (pointer.mode !== 'idle') apply(pointer.move(x, y))
      }
      pointerInside = true
      const p = latest.current
      const over = isRevealed(pointerX, pointerY) || p.lens ? (hitTestNode(layout, pointerX, pointerY, width, height, hitRadius())?.id ?? null) : null
      if (over !== hoverId) {
        hoverId = over
        dirty.current = true
      }
      fogCanvas.style.cursor = p.lens ? 'none' : over ? 'pointer' : fogAmount > 0.5 && !isRevealed(pointerX, pointerY) ? 'none' : 'default'
      if (p.lens) dirty.current = true
      updateBrushCursor()
    }
    const onUp = (ev: PointerEvent) => {
      const [x, y] = local(ev)
      apply(pointer.up(x, y))
      if (fogCanvas.hasPointerCapture(ev.pointerId)) fogCanvas.releasePointerCapture(ev.pointerId)
      reportFog(true)
      updateBrushCursor()
    }
    const onCancel = () => {
      apply(pointer.cancel())
      updateBrushCursor()
    }
    const onLeave = () => {
      pointerInside = false
      if (hoverId !== null) {
        hoverId = null
        dirty.current = true
      }
      if (latest.current.lens) dirty.current = true
      updateBrushCursor()
    }
    const onKey = (ev: KeyboardEvent) => {
      // Keyboard alternative to wiping.
      if ((ev.key === 'Enter' || ev.key === ' ') && fogTarget.current > 0) {
        ev.preventDefault()
        fogTarget.current = 0
        latest.current.onFogProgress?.(1)
        dirty.current = true
      }
    }

    fogCanvas.addEventListener('pointerdown', onDown)
    fogCanvas.addEventListener('pointermove', onMove)
    fogCanvas.addEventListener('pointerup', onUp)
    fogCanvas.addEventListener('pointercancel', onCancel)
    fogCanvas.addEventListener('pointerleave', onLeave)
    fogCanvas.addEventListener('keydown', onKey)

    const onVisibility = () => {
      visible = !document.hidden
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const intersection = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting && !document.hidden
      last = performance.now()
    })
    intersection.observe(wrap)

    const frame = (now: number) => {
      if (!running) return
      raf = requestAnimationFrame(frame)
      if (!visible || width === 0) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const p = latest.current

      if (resetRequested.current) {
        resetRequested.current = false
        mask.reset()
        lastProgressSent = -1
        reportFog(true)
      }

      // Ease the global fog amount toward its target: the material transition.
      const before = fogAmount
      if (reducedMotion) fogAmount = fogTarget.current
      else fogAmount += (fogTarget.current - fogAmount) * Math.min(1, dt * (fogTarget.current < fogAmount ? 2.2 : 1.6))
      if (Math.abs(fogAmount - fogTarget.current) < 0.003) fogAmount = fogTarget.current
      const fogMoving = fogAmount !== before
      if (fogAmount === 0 && before !== 0) mask.clearAll()

      if (reducedMotion && !dirty.current && !fogMoving) return
      dirty.current = false
      if (!reducedMotion) clock += dt

      const key = `${width}x${height}:${p.indicators.length}`
      if (key !== layoutKey) {
        layout = buildLayout(p.indicators, p.categories, width / height)
        layoutKey = key
      }

      scene.draw(sceneCtx, {
        width,
        height,
        dpr,
        time: clock,
        layout,
        snapshot: p.snapshot,
        selectedId: p.selectedId,
        hoverId,
        connection: p.connection,
        drag,
        reducedMotion,
      })

      const lensOn = p.lens && pointerInside
      const fogNeeded = !!fog && (fogAmount > 0 || lensOn)
      if (fog && fogNeeded) {
        if (fogCanvas.style.opacity !== '1') fogCanvas.style.opacity = '1'
        fog.render(sceneCanvas, mask, {
          time: clock,
          fogAmount,
          lens: { x: pointerX / width, y: pointerY / height, radius: lensRadius() / height, on: lensOn },
          pointer: { x: pointerX / width, y: pointerY / height },
        })
      } else if (fogCanvas.style.opacity !== '0') {
        // Nothing to draw: leave the crisp scene canvas showing.
        fogCanvas.style.opacity = '0'
      }

      // Data lens target for the DOM readout.
      if (p.onLensTarget) {
        if (lensOn) {
          const r = lensRadius()
          const node = hitTestNode(layout, pointerX, pointerY, width, height, r * 0.85)
          const lk = `${node?.id ?? ''}:${Math.round(pointerX)}:${Math.round(pointerY)}`
          if (lk !== lastLensKey) {
            lastLensKey = lk
            p.onLensTarget({ id: node?.id ?? null, x: pointerX, y: pointerY, radius: r, canvasWidth: width, canvasHeight: height })
          }
        } else if (lastLensKey !== '') {
          lastLensKey = ''
          p.onLensTarget(null)
        }
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      intersection.disconnect()
      reduced.removeEventListener('change', onReduced)
      document.removeEventListener('visibilitychange', onVisibility)
      fogCanvas.removeEventListener('pointerdown', onDown)
      fogCanvas.removeEventListener('pointermove', onMove)
      fogCanvas.removeEventListener('pointerup', onUp)
      fogCanvas.removeEventListener('pointercancel', onCancel)
      fogCanvas.removeEventListener('pointerleave', onLeave)
      fogCanvas.removeEventListener('keydown', onKey)
      fog?.dispose()
      scene.dispose()
    }
    // The loop reads props through `latest`; it is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${props.className ?? ''}`} style={{ background: '#02040a' }}>
      <canvas ref={sceneRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <canvas
        ref={fogRef}
        className="absolute inset-0 h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-accent"
        style={{ touchAction: 'none' }}
        tabIndex={0}
        role="img"
        aria-label={props.ariaLabel ?? 'Health-signal constellation behind a fogged visor. Press Enter to clear the fog. A full data table is available below.'}
      />
      <div
        ref={brushRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 rounded-full border border-white/50 opacity-0"
        style={{ boxShadow: '0 0 0 1px rgba(2,4,10,0.35), inset 0 0 24px rgba(200,220,255,0.12)', transition: 'opacity 0.15s ease, width 0.15s ease, height 0.15s ease' }}
      >
        {/* The glove doing the wiping. */}
        <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-[46%] w-[46%] opacity-45" fill="rgba(210,225,250,0.12)" stroke="rgba(235,242,255,0.9)" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
          <path d="M8 21v-9.6a1.4 1.4 0 0 1 2.8 0V5.2a1.4 1.4 0 0 1 2.8 0v5.3-4a1.4 1.4 0 0 1 2.8 0v4.4-2.4a1.4 1.4 0 0 1 2.8 0V15c0 3.6-2.3 6-5.8 6z" />
          <path d="M8 15.2 5.9 13a1.4 1.4 0 0 0-2.1 1.9L8 19.4" />
        </svg>
      </div>
    </div>
  )
}
