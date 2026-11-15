import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useMission } from '../../hooks/useMission'
import type { PageId } from '../../types'
import { createDeckRenderer, type DeckRenderer } from './render/DeckRenderer'
import { moveWithCollision, heightAt, stationInReach, ROOMS, SPAWN, STATIONS, STATION_BY_ID, type Station, type StationId } from './model/deck'
import { StationContent } from './ui/StationPanels'

const EYE = 1.62
const WALK = 3.2 // m/s
const RUN = 5.6
const RADIUS = 0.42
const MAX_DPR = 1.6
const LOOK = 0.0022

type Status = 'loading' | 'running' | 'unsupported'

/**
 * The flight deck.
 *
 * A first-person view of the vessel drawn by DeckRenderer, with the console
 * screens rendered as DOM over the canvas so they can reuse the application's
 * own components and data rather than duplicating them in the 3D scene.
 *
 * The loop owns movement and reads React state through a ref, so a prompt
 * appearing never re-subscribes the listeners or restarts the animation.
 */
export function FlightDeck() {
  const m = useMission()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [status, setStatus] = useState<Status>('loading')
  const [locked, setLocked] = useState(false)
  const [prompt, setPrompt] = useState<Station | null>(null)
  const [open, setOpen] = useState<StationId | null>(null)
  const [touch, setTouch] = useState(false)

  // Shared with the loop without re-running it.
  const openRef = useRef<StationId | null>(null)
  openRef.current = open
  const alertRef = useRef(0)
  alertRef.current = Math.min(1, m.alerts.filter((a) => a.active && a.severity !== 'info').length / 2)
  const travelRef = useRef<{ x: number; z: number; yaw: number } | null>(null)
  const promptRef = useRef<Station | null>(null)

  const setPage = m.setPage
  const leave = useCallback(
    (page: PageId) => {
      document.exitPointerLock?.()
      setPage(page)
    },
    [setPage],
  )

  /** Walk the camera to a station. Used by the tour and by touch devices. */
  const travelTo = useCallback((id: StationId) => {
    const s = STATION_BY_ID[id]
    // Stand a little back from the console, facing it.
    // The console's back points along (sin, cos) of its facing, so the place to
    // stand is that far in front of it, looking back along the same axis.
    // forward(yaw) is (-sin yaw, -cos yaw), so facing a direction d means
    // yaw = atan2(-d.x, -d.z).
    const dx = Math.sin(s.facing)
    const dz = Math.cos(s.facing)
    travelRef.current = { x: s.x - dx * 2.0, z: s.z - dz * 2.0, yaw: Math.atan2(-dx, -dz) }
  }, [])

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const renderer: DeckRenderer | null = createDeckRenderer(canvas)
    if (!renderer) {
      setStatus('unsupported')
      return
    }
    setStatus('running')

    let x = SPAWN.x
    let z = SPAWN.z
    let yaw = SPAWN.yaw
    let pitch = 0
    let width = 0
    let height = 0
    let raf = 0
    let running = true
    let visible = true
    let last = performance.now()
    let clock = 0
    const keys = new Set<string>()

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width))
      const h = Math.max(1, Math.round(r.height))
      if (w === width && h === height) return
      width = w
      height = h
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      renderer.resize(Math.round(w * dpr), Math.round(h * dpr))
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    const io = new IntersectionObserver((es) => {
      for (const e of es) visible = e.isIntersecting && !document.hidden
      last = performance.now()
    })
    io.observe(wrap)
    const onVis = () => {
      visible = !document.hidden
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVis)

    // ------------------------------------------------------------ input
    const onKeyDown = (e: KeyboardEvent) => {
      if (openRef.current) return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys.add(k)
        e.preventDefault()
      }
      if (k === 'e' && promptRef.current) {
        document.exitPointerLock?.()
        setOpen(promptRef.current.id)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const onBlur = () => keys.clear()

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      yaw -= e.movementX * LOOK
      pitch = Math.max(-1.25, Math.min(1.25, pitch - e.movementY * LOOK))
      travelRef.current = null
    }
    const onLockChange = () => setLocked(document.pointerLockElement === canvas)

    const onCanvasClick = () => {
      if (openRef.current) return
      if (promptRef.current && document.pointerLockElement === canvas) {
        document.exitPointerLock?.()
        setOpen(promptRef.current.id)
        return
      }
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()
    }

    // Touch: drag anywhere to look. Movement is by the station buttons.
    let lastTouch: { x: number; y: number } | null = null
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) lastTouch = { x: t.clientX, y: t.clientY }
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t || !lastTouch) return
      yaw -= (t.clientX - lastTouch.x) * 0.005
      pitch = Math.max(-1.25, Math.min(1.25, pitch - (t.clientY - lastTouch.y) * 0.005))
      lastTouch = { x: t.clientX, y: t.clientY }
      travelRef.current = null
      e.preventDefault()
    }
    const onTouchEnd = () => {
      lastTouch = null
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    canvas.addEventListener('click', onCanvasClick)
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    // ------------------------------------------------------------- loop
    const frame = (now: number) => {
      if (!running) return
      raf = requestAnimationFrame(frame)
      if (!visible || width === 0) return
      const dt = Math.min(0.08, (now - last) / 1000)
      last = now
      if (!reduced.matches) clock += dt

      if (!openRef.current) {
        const travel = travelRef.current
        if (travel) {
          // Ease toward the target, and stop when close enough to walk again.
          const k = Math.min(1, dt * 2.6)
          x += (travel.x - x) * k
          z += (travel.z - z) * k
          let d = travel.yaw - yaw
          while (d > Math.PI) d -= Math.PI * 2
          while (d < -Math.PI) d += Math.PI * 2
          yaw += d * k
          pitch += (0 - pitch) * k
          if (Math.hypot(travel.x - x, travel.z - z) < 0.06 && Math.abs(d) < 0.02) travelRef.current = null
        } else {
          const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
          const strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)
          if (fwd || strafe) {
            const speed = (keys.has('shift') ? RUN : WALK) * dt
            // Camera forward on the deck plane, and its right-hand normal.
            const fx = -Math.sin(yaw)
            const fz = -Math.cos(yaw)
            const rx = -fz
            const rz = fx
            let vx = fx * fwd + rx * strafe
            let vz = fz * fwd + rz * strafe
            const len = Math.hypot(vx, vz) || 1
            vx = (vx / len) * speed
            vz = (vz / len) * speed
            const next = moveWithCollision(x, z, x + vx, z + vz, RADIUS)
            x = next.x
            z = next.z
          }
        }
      }

      // Prompt, pushed to React only when it changes.
      const near = openRef.current ? null : stationInReach(x, z, yaw)
      if (near?.id !== promptRef.current?.id) {
        promptRef.current = near
        setPrompt(near)
      }

      // Keep the eye under the deck-head of whichever compartment we are in.
      const eyeY = Math.min(EYE, heightAt(x, z) - 0.55)
      renderer.render({ eye: [x, eyeY, z], yaw, pitch, time: clock, alert: alertRef.current })
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      canvas.removeEventListener('click', onCanvasClick)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      if (document.pointerLockElement === canvas) document.exitPointerLock?.()
      renderer.dispose()
    }
  }, [])

  // ------------------------------------------------------------- fallback
  if (status === 'unsupported') {
    return (
      <div className="border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="eyebrow-sm">Deck plan</p>
          <p className="mt-1 text-[12.5px] text-muted">
            This browser has no WebGL2, so the vessel cannot be drawn. Every station is still
            available here, with the same instruments.
          </p>
        </div>
        <DeckPlan onOpen={setOpen} />
        {open && <StationModal id={open} onClose={() => setOpen(null)} onLeave={leave} />}
      </div>
    )
  }

  return (
    <div className="relative">
      <div ref={wrapRef} className="relative h-[clamp(420px,62vh,760px)] w-full overflow-hidden border border-border bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

        {/* Reticle, only while flying the camera. */}
        {locked && !open && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className={`h-4 w-4 border ${prompt ? 'border-cyan-300/80' : 'border-white/25'} rounded-full`} />
          </div>
        )}

        {/* Approach prompt. */}
        {locked && prompt && !open && (
          <div className="pointer-events-none absolute bottom-20 left-1/2 w-[min(90%,30rem)] -translate-x-1/2 border border-cyan-300/30 bg-black/70 px-4 py-2.5 text-center backdrop-blur-sm">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">{prompt.bay}</p>
            <p className="mt-0.5 text-[14px] text-white/90">{prompt.label}</p>
            <p className="mt-0.5 text-[11.5px] text-white/50">{prompt.hint}</p>
            <p className="mono mt-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/45">Click or press E</p>
          </div>
        )}

        {/* Entry plate. */}
        {!locked && !open && !touch && (
          <button
            onClick={() => canvasRef.current?.requestPointerLock?.()}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center backdrop-blur-[2px]"
          >
            <p className="mono text-[10.5px] uppercase tracking-[0.22em] text-cyan-200/70">AURORA · Research vessel</p>
            <p className="display mt-2 text-[clamp(1.6rem,3.4vw,2.6rem)] text-white">Step onto the deck</p>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-white/55">
              Click to take the controls. <span className="mono">W A S D</span> to walk,
              <span className="mono"> Shift</span> to move quickly, mouse to look,
              <span className="mono"> E</span> at a console. <span className="mono">Esc</span> releases the pointer.
            </p>
          </button>
        )}

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="annotate text-white/50">BRINGING THE DECK UP…</p>
          </div>
        )}

        {/* Touch mode: look by dragging, travel by button. */}
        {touch && !open && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 border-t border-white/10 bg-black/60 p-2 backdrop-blur-sm">
            <span className="mono w-full pb-1 text-[9.5px] uppercase tracking-[0.18em] text-white/40">
              Drag to look · tap a bay to walk there
            </span>
            {STATIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => travelTo(s.id)}
                className="mono border border-white/20 px-2 py-1 text-[10px] uppercase tracking-wider text-white/70"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop bay jumps, so nobody can get lost looking for a station. */}
      {!touch && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border px-3 py-2">
          <span className="eyebrow-sm shrink-0">Walk to</span>
          {STATIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => travelTo(s.id)}
              className="mono text-[10.5px] uppercase tracking-wider text-muted transition-colors hover:text-text-strong"
            >
              {s.label}
            </button>
          ))}
          <span className="annotate ml-auto shrink-0">{ROOMS.length} COMPARTMENTS · {STATIONS.length} BAYS</span>
        </div>
      )}

      {open && <StationModal id={open} onClose={() => setOpen(null)} onLeave={leave} />}
    </div>
  )
}

function StationModal({
  id,
  onClose,
  onLeave,
}: {
  id: StationId
  onClose: () => void
  onLeave: (page: PageId) => void
}) {
  const s = STATION_BY_ID[id]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={s.label}>
      <div className="max-h-[86vh] w-full max-w-4xl overflow-y-auto border border-cyan-300/20 bg-neutral-950/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">{s.bay}</p>
            <h2 className="display mt-0.5 text-[1.5rem] text-white">{s.label}</h2>
          </div>
          <button onClick={onClose} aria-label="Close console" className="mt-1 text-white/50 transition-colors hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5">
          <StationContent id={id} onLeave={onLeave} />
        </div>
        <div className="border-t border-white/10 px-5 py-2.5">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Synthetic crew data · not a medical device · Esc to return to the deck
          </p>
        </div>
      </div>
    </div>
  )
}

/** Top-down plan, used when WebGL2 is unavailable. */
function DeckPlan({ onOpen }: { onOpen: (id: StationId) => void }) {
  const minX = Math.min(...ROOMS.map((r) => r.x0)) - 1
  const maxX = Math.max(...ROOMS.map((r) => r.x1)) + 1
  const minZ = Math.min(...ROOMS.map((r) => r.z0)) - 1
  const maxZ = Math.max(...ROOMS.map((r) => r.z1)) + 1
  return (
    <div className="p-4">
      <svg viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`} className="w-full" style={{ transform: 'scaleY(-1)' }} aria-label="Deck plan">
        {ROOMS.map((r) => (
          <rect key={r.id} x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth={0.12} />
        ))}
        {STATIONS.map((s) => (
          <circle key={s.id} cx={s.x} cy={s.z} r={0.8} fill="var(--accent)" opacity={0.75} />
        ))}
      </svg>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STATIONS.map((s) => (
          <button key={s.id} onClick={() => onOpen(s.id)} className="panel p-3 text-left transition-colors hover:border-border-strong">
            <p className="annotate">{s.bay}</p>
            <p className="mt-0.5 text-[13.5px] text-text-strong">{s.label}</p>
            <p className="mt-1 text-[11.5px] leading-snug text-muted">{s.hint}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
