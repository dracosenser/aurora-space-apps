import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Gauge, Maximize2, Minimize2, Target, X } from 'lucide-react'
import { useMission } from '../../hooks/useMission'
import type { PageId } from '../../types'
import { createDeckRenderer, type DeckRenderer } from './render/DeckRenderer'
import { QUALITY_ORDER, QualityGovernor, detectQuality, rememberQuality, type QualityName } from './render/quality'
import {
  moveWithCollision, heightAt, stationInReach, ROOMS, SPAWN, STATIONS, STATION_BY_ID,
  type Station, type StationId,
} from './model/deck'
import {
  advance as advanceAirlock, command as airlockCommand, hatchOpenness, newAirlock, shutDoors,
  type Airlock, type AirlockCommand,
} from './model/airlock'
import { newSuitPrep, prepComplete, type SuitPrep } from './model/suit'
import {
  ALL_EVA_STEPS, EGRESS, EVA_TASK_BY_ID, evaPointInReach, siteInReach, stepEva, tetherDistance,
  TETHER_LENGTH, taskComplete,
  type EvaMotion, type EvaPoint, type EvaTaskId,
} from './model/eva'
import { AirlockPanel, PostEvaPanel, SuitPanel, WorksitePanel } from './ui/EvaPanels'
import {
  OBJECTIVES, currentObjective, loadProgress, loadSteps, objectiveDone, saveProgress, saveSteps,
  type TaskId,
} from './model/objectives'
import { ALL_PROC_STEPS } from './model/procedures'
import { entryOverlay } from './model/overlay'
import { StationContent } from './ui/StationPanels'

const EYE = 1.62
// Walking and sprinting speeds, in metres per second. Raised by exactly 5%
// over the original 3.2 and 5.6: these are the only speed terms in the loop,
// and dt scales them, so nothing else is multiplied twice.
const WALK = 3.2 * 1.05
const RUN = 5.6 * 1.05
const RADIUS = 0.42
const LOOK = 0.0022
/** How long the camera takes to settle onto a console screen, and back. */
const ZOOM_MS = 620

type Status = 'loading' | 'running' | 'unsupported'
interface Pose { x: number; y: number; z: number; yaw: number; pitch: number }

/** Where the camera sits to read a console's screen head-on. */
function screenPose(s: Station): Pose {
  const bx = Math.sin(s.facing)
  const bz = Math.cos(s.facing)
  return { x: s.x - bx * 1.04, y: 1.3, z: s.z - bz * 1.04, yaw: Math.atan2(-bx, -bz), pitch: -0.02 }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * The station.
 *
 * A first-person view drawn by DeckRenderer, with console screens rendered as
 * DOM over the canvas so they reuse the application's own components and data
 * rather than duplicating them in the 3D scene. Activating a console flies the
 * camera onto its screen and opens that screen's content in place, so reading
 * an instrument never leaves the vessel.
 *
 * The loop owns movement and reads React state through refs, so a prompt
 * appearing never re-subscribes listeners or restarts the animation.
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
  const [full, setFull] = useState(false)
  const [quality, setQualityState] = useState<QualityName>('medium')
  const [autoQuality, setAutoQuality] = useState(true)
  const [frameMs, setFrameMs] = useState(16)
  const [done, setDone] = useState<TaskId[]>([])
  const [showObjectives, setShowObjectives] = useState(true)
  /**
   * Whether anyone has taken the controls yet. The full entry plate is for the
   * first time only; after that, losing the pointer is an ordinary thing that
   * happens whenever a console is opened or Escape is pressed, and throwing the
   * whole entry screen up again each time is what made it keep reappearing.
   */
  const [entered, setEntered] = useState(false)
  /** True while the camera is flying to or from a console screen. */
  const [flying, setFlying] = useState(false)

  // ---- the extravehicular system
  const [airlock, setAirlock] = useState<Airlock>(newAirlock)
  const [prep, setPrep] = useState<SuitPrep>(newSuitPrep)
  const [evaSteps, setEvaSteps] = useState<string[]>([])
  /** Which EVA screen is up, if any. Separate from the console `open`. */
  const [evaPanel, setEvaPanel] = useState<'suit' | 'airlock' | 'post' | EvaTaskId | null>(null)
  /** The EVA interaction point or worksite being looked at, for the prompt. */
  const [evaPrompt, setEvaPrompt] = useState<{ kind: 'point' | 'site' | 'return'; label: string; hint: string } | null>(null)
  const [tether, setTether] = useState({ out: 0, taut: false, grip: false })
  /** Completed procedure steps, qualified by procedure. */
  const [procDone, setProcDone] = useState<string[]>([])

  const openRef = useRef<StationId | null>(null)
  openRef.current = open
  const alertRef = useRef(0)
  alertRef.current = Math.min(1, m.alerts.filter((a) => a.active && a.severity !== 'info').length / 2)
  const promptRef = useRef<Station | null>(null)
  const travelRef = useRef<Pose | null>(null)
  const zoomRef = useRef<{ phase: 'in' | 'out'; t: number; from: Pose; to: Pose; station: StationId } | null>(null)
  const savedPoseRef = useRef<Pose | null>(null)
  const qualityRef = useRef<QualityName>('medium')
  const autoRef = useRef(true)
  autoRef.current = autoQuality
  const rendererRef = useRef<DeckRenderer | null>(null)
  const resizeRef = useRef<(() => void) | null>(null)
  const resetGovRef = useRef<(() => void) | null>(null)
  const openStationRef = useRef<((id: StationId) => void) | null>(null)
  /**
   * The airlock is advanced by the loop and commanded by the panel, so the
   * loop owns a mutable copy and React mirrors it. Keeping React as the owner
   * would mean a setState every frame of a pressure sequence just to move a
   * bar, and keeping the loop as the sole owner would leave the panel stale.
   */
  const airlockRef = useRef<Airlock>(newAirlock())
  const prepRef = useRef<SuitPrep>(newSuitPrep())
  prepRef.current = prep
  const evaRef = useRef<EvaMotion>({ x: EGRESS.x, y: EGRESS.y, z: EGRESS.z, vx: 0, vy: 0, vz: 0 })
  const evaPanelRef = useRef<typeof evaPanel>(null)
  evaPanelRef.current = evaPanel
  const evaPromptRef = useRef<{ kind: 'point' | 'site' | 'return'; label: string; hint: string; id?: string } | null>(null)
  const openEvaRef = useRef<(() => void) | null>(null)
  const runCommandRef = useRef<((c: AirlockCommand) => void) | null>(null)
  const evaStepsRef = useRef<string[]>([])
  evaStepsRef.current = evaSteps

  useEffect(() => {
    setDone(loadProgress())
    // Procedure steps and worksite steps share one store; each is validated
    // against the keys its own model actually defines.
    const all = loadSteps([...ALL_PROC_STEPS, ...ALL_EVA_STEPS])
    setProcDone(all.filter((k) => !k.startsWith('eva-0')))
    setEvaSteps(all.filter((k) => k.startsWith('eva-0')))
    setTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  /** Mark a task done. Idempotent, and only ever called from a real action. */
  const markTask = useCallback((id: TaskId) => {
    setDone((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      saveProgress(next)
      return next
    })
  }, [])

  /** Record one performed step. Idempotent; persisted beside the task list. */
  const markProcStep = useCallback((key: string) => {
    setProcDone((prev) => {
      if (prev.includes(key)) return prev
      const next = [...prev, key]
      saveSteps([...next, ...evaStepsRef.current])
      return next
    })
  }, [])

  const setPage = m.setPage
  const leave = useCallback(
    (page: PageId) => {
      document.exitPointerLock?.()
      setPage(page)
    },
    [setPage],
  )

  const applyQuality = useCallback((name: QualityName) => {
    qualityRef.current = name
    setQualityState(name)
    setAutoQuality(false)
    rememberQuality(name)
    rendererRef.current?.setQuality(name)
    resizeRef.current?.()
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void el.requestFullscreen?.().catch(() => undefined)
  }, [])

  useEffect(() => {
    const onChange = () => {
      setFull(document.fullscreenElement === wrapRef.current)
      // The element's box changes on the next frame, so let the observer see it.
      requestAnimationFrame(() => {
        resizeRef.current?.()
        // The frame just changed size by a large factor; the running average
        // from the old size says nothing about the new one.
        resetGovRef.current?.()
      })
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ------------------------------------------------------------- the loop
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const renderer = createDeckRenderer(canvas)
    if (!renderer) {
      setStatus('unsupported')
      return
    }
    rendererRef.current = renderer
    const first = detectQuality()
    qualityRef.current = first
    setQualityState(first)
    renderer.setQuality(first)
    setStatus('running')

    let x = SPAWN.x
    let z = SPAWN.z
    let eyeY = EYE
    let yaw = SPAWN.yaw
    let pitch = 0
    let cssW = 0
    let raf = 0
    let running = true
    let visible = true
    let last = performance.now()
    let clock = 0
    const keys = new Set<string>()
    const gov = new QualityGovernor()
    resetGovRef.current = () => gov.reset()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width))
      const h = Math.max(1, Math.round(r.height))
      cssW = w
      const [bw, bh] = renderer.bufferSize(w, h, window.devicePixelRatio || 1)
      renderer.resize(bw, bh)
    }
    resizeRef.current = resize
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

    const pose = (): Pose => ({ x, y: eyeY, z, yaw, pitch })
    /** Outside the hull exactly while the spacewalk is live. */
    const outsideNow = () => airlockRef.current.state === 'eva-active'
    let mirrorAt = 0

    // Commands come from the panel; the loop needs to react to two of them by
    // moving the camera, which is why this lives here rather than in a
    // callback that cannot see the loop's own position variables.
    runCommandRef.current = (c: AirlockCommand) => {
      const next = airlockCommand(airlockRef.current, c, prepComplete(prepRef.current))
      airlockRef.current = next
      setAirlock(next)
      if (c === 'egress' && next.state === 'eva-active') {
        // Step out onto the hull at the hatch, with no leftover velocity.
        evaRef.current = { x: EGRESS.x, y: EGRESS.y, z: EGRESS.z, vx: 0, vy: 0, vz: 0 }
        x = EGRESS.x; eyeY = EGRESS.y; z = EGRESS.z
        yaw = Math.atan2(-(0 - EGRESS.x), -(-21.7 - EGRESS.z))
        pitch = 0
      }
      if (c === 'return' && next.state === 'crew-returning') {
        // Back inside the chamber, standing on the deck again.
        x = -10.0; z = -21.7; eyeY = EYE
        yaw = Math.atan2(-(1), -(0))
      }
      if (c === 'ingress') {
        x = -6.6; z = -21.7; eyeY = EYE
      }
    }

    const beginZoom = (id: StationId) => {
      if (zoomRef.current) return
      savedPoseRef.current = pose()
      zoomRef.current = { phase: 'in', t: 0, from: pose(), to: screenPose(STATION_BY_ID[id]), station: id }
      setFlying(true)
      // The pointer is released so the console can be read and clicked. That
      // is not the crew member leaving the station, so it must not bring the
      // entry screen back.
      document.exitPointerLock?.()
    }
    openStationRef.current = beginZoom

    // ------------------------------------------------------------ input
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'f' && !openRef.current) {
        toggleFullscreen()
        return
      }
      if (openRef.current || zoomRef.current) return
      if (['w', 'a', 's', 'd', 'shift', 'control', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys.add(k)
        e.preventDefault()
      }
      if (k === 'e') {
        // Outside, and at the EVA fittings inside, E opens the EVA screen for
        // whatever is in reach. At a console it flies the camera onto it.
        if (evaPromptRef.current) openEvaRef.current?.()
        else if (promptRef.current) beginZoom(promptRef.current.id)
      }
    }
    openEvaRef.current = () => {
      const ep = evaPromptRef.current
      if (!ep) return
      if (ep.kind === 'point') setEvaPanel(ep.id === 'suit-rack' ? 'suit' : 'airlock')
      else if (ep.kind === 'site' && ep.id) setEvaPanel(ep.id as EvaTaskId)
      else if (ep.kind === 'return') runCommandRef.current?.('return')
      document.exitPointerLock?.()
    }

    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const onBlur = () => keys.clear()

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas || zoomRef.current) return
      yaw -= e.movementX * LOOK
      pitch = Math.max(-1.25, Math.min(1.25, pitch - e.movementY * LOOK))
      travelRef.current = null
    }
    const onLockChange = () => {
      const on = document.pointerLockElement === canvas
      setLocked(on)
      if (on) setEntered(true)
    }

    const onCanvasClick = () => {
      if (openRef.current || zoomRef.current || evaPanelRef.current) return
      if (evaPromptRef.current && document.pointerLockElement === canvas) {
        openEvaRef.current?.()
        return
      }
      if (promptRef.current && document.pointerLockElement === canvas) {
        beginZoom(promptRef.current.id)
        return
      }
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()
    }

    let lastTouch: { x: number; y: number } | null = null
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) lastTouch = { x: t.clientX, y: t.clientY }
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t || !lastTouch || zoomRef.current) return
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
      if (!visible || cssW === 0) return
      const dtMs = now - last
      const dt = Math.min(0.08, dtMs / 1000)
      last = now
      if (!reduced.matches) clock += dt

      const zoom = zoomRef.current
      if (zoom) {
        // Movement is locked while the camera flies to or from a screen.
        zoom.t = Math.min(1, zoom.t + dtMs / ZOOM_MS)
        const k = easeInOut(zoom.t)
        const L = (a: number, b: number) => a + (b - a) * k
        x = L(zoom.from.x, zoom.to.x)
        eyeY = L(zoom.from.y, zoom.to.y)
        z = L(zoom.from.z, zoom.to.z)
        let d = zoom.to.yaw - zoom.from.yaw
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        yaw = zoom.from.yaw + d * k
        pitch = L(zoom.from.pitch, zoom.to.pitch)
        if (zoom.t >= 1) {
          if (zoom.phase === 'in') setOpen(zoom.station)
          zoomRef.current = null
          setFlying(false)
        }
      } else if (!openRef.current && !evaPanelRef.current && outsideNow()) {
        // ---- free fall, outside the hull
        //
        // A different movement model, not the interior walk with gravity off:
        // input accelerates rather than sets speed, nothing stops you but a
        // handrail, and the tether is the only hard limit.
        const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
        const strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)
        const rise = (keys.has(' ') ? 1 : 0) - (keys.has('shift') || keys.has('control') ? 1 : 0)
        // Forward follows where the crew member is looking, pitch included.
        const cp = Math.cos(pitch)
        const fx = -Math.sin(yaw) * cp
        const fy = Math.sin(pitch)
        const fz = -Math.cos(yaw) * cp
        const rx = Math.cos(yaw)
        const rz = -Math.sin(yaw)
        let ax = fx * fwd + rx * strafe
        let ay = fy * fwd + rise
        let az = fz * fwd + rz * strafe
        const al = Math.hypot(ax, ay, az)
        if (al > 1) { ax /= al; ay /= al; az /= al }
        const m2 = stepEva(evaRef.current, ax, ay, az, dt)
        evaRef.current = { x: m2.x, y: m2.y, z: m2.z, vx: m2.vx, vy: m2.vy, vz: m2.vz }
        x = m2.x
        eyeY = m2.y
        z = m2.z
        if (Math.random() < 0.08) {
          setTether({ out: tetherDistance(m2.x, m2.y, m2.z), taut: m2.taut, grip: m2.grip })
        }
      } else if (!openRef.current && !evaPanelRef.current) {
        const travel = travelRef.current
        if (travel) {
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
            const fx = -Math.sin(yaw)
            const fz = -Math.cos(yaw)
            let vx = fx * fwd - fz * strafe
            let vz = fz * fwd + fx * strafe
            const len = Math.hypot(vx, vz) || 1
            vx = (vx / len) * speed
            vz = (vz / len) * speed
            // The shut-hatch set comes from the same airlock state that
            // drives the leaf the renderer draws, so a hatch can never look
            // open while blocking or look shut while letting someone past.
            const next = moveWithCollision(x, z, x + vx, z + vz, RADIUS, shutDoors(airlockRef.current))
            x = next.x
            z = next.z
          }
        }
        eyeY += (Math.min(EYE, heightAt(x, z) - 0.55) - eyeY) * Math.min(1, dt * 8)
      }

      // ---- the airlock runs on its own clock, whatever else is happening
      {
        const before = airlockRef.current
        const after = advanceAirlock(before, dt)
        airlockRef.current = after
        // Mirror to React on a state change at once, and otherwise only often
        // enough to move a pressure bar smoothly.
        if (after.state !== before.state) {
          setAirlock(after)
          mirrorAt = now
        } else if (now - mirrorAt > 110) {
          setAirlock(after)
          mirrorAt = now
        }
      }

      const near = openRef.current || zoomRef.current ? null : stationInReach(x, z, yaw)
      if (near?.id !== promptRef.current?.id) {
        promptRef.current = near
        setPrompt(near)
      }

      // ---- what the EVA system offers from here
      {
        let ep: { kind: 'point' | 'site' | 'return'; label: string; hint: string; id?: string } | null = null
        if (!openRef.current && !zoomRef.current && !evaPanelRef.current) {
          if (outsideNow()) {
            const site = siteInReach(x, eyeY, z)
            if (site) ep = { kind: 'site', label: site.code + ' · ' + site.title, hint: site.site.label, id: site.id }
            else if (Math.hypot(x - EGRESS.x, eyeY - EGRESS.y, z - EGRESS.z) < 3.0) {
              ep = { kind: 'return', label: 'Return to the airlock', hint: 'Enter the chamber and close the outer hatch' }
            }
          } else {
            const pt: EvaPoint | null = evaPointInReach(x, z, yaw)
            if (pt) ep = { kind: 'point', label: pt.label, hint: pt.hint, id: pt.id }
          }
        }
        if (ep?.id !== evaPromptRef.current?.id || ep?.kind !== evaPromptRef.current?.kind) {
          evaPromptRef.current = ep
          setEvaPrompt(ep)
        }
      }

      renderer.render({
        eye: [x, eyeY, z], yaw, pitch, time: clock, alert: alertRef.current,
        mode: outsideNow() ? 'exterior' : 'interior',
        hatches: hatchOpenness(airlockRef.current),
      })

      const next = gov.sample(dtMs, qualityRef.current, !autoRef.current)
      if (next && next !== qualityRef.current) {
        qualityRef.current = next
        setQualityState(next)
        renderer.setQuality(next)
        resize()
      }
      // The readout only needs to be roughly live, and setting state every
      // frame would re-render the overlay sixty times a second for nothing.
      if (Math.random() < 0.03) setFrameMs(gov.frameMs)
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
      rendererRef.current = null
      resizeRef.current = null
      resetGovRef.current = null
      openStationRef.current = null
      runCommandRef.current = null
      openEvaRef.current = null
    }
  }, [toggleFullscreen])

  /** Fly back out to where the crew member was standing. */
  const closeStation = useCallback(() => {
    const id = openRef.current
    setOpen(null)
    const back = savedPoseRef.current
    if (back && id) {
      zoomRef.current = { phase: 'out', t: 0, from: screenPose(STATION_BY_ID[id]), to: back, station: id }
      setFlying(true)
    }
  }, [])

  const travelTo = useCallback((id: StationId) => {
    const s = STATION_BY_ID[id]
    const bx = Math.sin(s.facing)
    const bz = Math.cos(s.facing)
    travelRef.current = { x: s.x - bx * 2.0, y: EYE, z: s.z - bz * 2.0, yaw: Math.atan2(-bx, -bz), pitch: 0 }
  }, [])

  /** Outside the hull exactly while the spacewalk is live. */
  const outside = airlock.state === 'eva-active'

  // Which entry overlay to show, if any. The rule lives in its own module and
  // is tested exhaustively, because tying it to pointer lock is the mistake
  // that made STEP ABOARD keep coming back.
  const overlay = entryOverlay({
    entered,
    locked,
    consoleOpen: open !== null,
    evaOpen: evaPanel !== null,
    flying,
    touch,
  })

  // Escape closes an EVA screen, as it closes a console.
  useEffect(() => {
    if (!evaPanel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEvaPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [evaPanel])

  // Coming back in offers the post-EVA review once, and only after a spacewalk
  // that actually happened.
  useEffect(() => {
    if (airlock.state === 'post-eva' && airlock.evaSeconds > 0) setEvaPanel('post')
  }, [airlock.state, airlock.evaSeconds])

  /**
   * The EVA objective tasks.
   *
   * Each is closed by the thing it describes having happened, rather than by
   * a screen having been opened: the suit task by the preparation model
   * reporting complete, the egress task by the airlock reaching the state
   * where a crew member is outside, and the maintenance tasks by their steps
   * being in the completed set.
   */
  useEffect(() => {
    if (prepComplete(prep)) markTask('eva-suit-ready')
  }, [prep, markTask])
  useEffect(() => {
    if (airlock.state === 'eva-active') markTask('eva-egress')
    if (airlock.state === 'post-eva') markTask('eva-ingress')
  }, [airlock.state, markTask])
  useEffect(() => {
    const tasks = Object.values(EVA_TASK_BY_ID)
    const closed = tasks.filter((t) => taskComplete(t, evaSteps))
    if (closed.length > 0) markTask('eva-task-done')
    if (closed.length === tasks.length) markTask('eva-all-tasks')
  }, [evaSteps, markTask])

  const objective = currentObjective(done)
  const doneCount = OBJECTIVES.filter((o) => objectiveDone(o, done)).length

  // ------------------------------------------------------------- fallback
  if (status === 'unsupported') {
    return (
      <div className="border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="eyebrow-sm">Deck plan</p>
          <p className="mt-1 text-[12.5px] text-muted">
            This browser has no WebGL2, so the station cannot be drawn. Every console is still
            available here, with the same instruments.
          </p>
        </div>
        <DeckPlan onOpen={setOpen} />
        {open && (
          <StationModal
            id={open}
            onClose={() => setOpen(null)}
            onLeave={leave}
            onTask={markTask}
            zoomed={false}
            procDone={procDone}
            onProcStep={markProcStep}
            evaDone={airlock.evaSeconds > 0}
            evaSeconds={airlock.evaSeconds}
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className={`relative w-full overflow-hidden bg-black ${full ? 'h-screen' : 'h-[clamp(420px,62vh,760px)] border border-border'}`}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

        {locked && !open && !prompt && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-1.5 w-1.5 rounded-full bg-white/50" />
          </div>
        )}
        {locked && prompt && !open && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="h-5 w-5 rounded-full border border-cyan-300/80" />
            </div>
            <div className="pointer-events-none absolute bottom-20 left-1/2 w-[min(90%,30rem)] -translate-x-1/2 border border-cyan-300/30 bg-black/70 px-4 py-2.5 text-center backdrop-blur-sm">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">{prompt.bay}</p>
              <p className="mt-0.5 text-[14px] text-white/90">{prompt.label}</p>
              <p className="mt-0.5 text-[11.5px] text-white/50">{prompt.hint}</p>
              <p className="mono mt-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/45">Click or press E to use</p>
            </div>
          </>
        )}

        {/* The EVA prompt: suit rack, airlock control, a worksite, or the
            way back in. Same shape as the console prompt so the two read as
            one interaction. */}
        {locked && evaPrompt && !open && !evaPanel && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="h-5 w-5 rounded-full border border-amber-300/80" />
            </div>
            <div className="pointer-events-none absolute bottom-20 left-1/2 w-[min(90%,30rem)] -translate-x-1/2 border border-amber-300/30 bg-black/70 px-4 py-2.5 text-center backdrop-blur-sm">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-amber-200/70">
                {evaPrompt.kind === 'site' ? 'Exterior worksite' : evaPrompt.kind === 'return' ? 'Airlock' : 'EVA'}
              </p>
              <p className="mt-0.5 text-[14px] text-white/90">{evaPrompt.label}</p>
              <p className="mt-0.5 text-[11.5px] text-white/50">{evaPrompt.hint}</p>
              <p className="mono mt-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/45">Click or press E</p>
            </div>
          </>
        )}

        {/* The spacewalk HUD. Only outside, where tether and grip are the
            whole of what a crew member has to think about. */}
        {outside && !evaPanel && (
          <div className="absolute bottom-3 right-3 border border-amber-300/25 bg-black/70 px-3 py-2 backdrop-blur-sm">
            <p className="mono text-[9.5px] uppercase tracking-[0.18em] text-amber-200/70">Extravehicular</p>
            <p className="mono mt-1 text-[11px] text-white/80">
              Tether {tether.out.toFixed(1)} / {TETHER_LENGTH} m
            </p>
            <div className="mt-1 h-1 w-36 border border-white/20">
              <div
                className={`h-full ${tether.taut ? 'bg-amber-400/80' : 'bg-emerald-400/60'}`}
                style={{ width: `${Math.min(100, (tether.out / TETHER_LENGTH) * 100)}%` }}
              />
            </div>
            <p className="mono mt-1.5 text-[10px] uppercase tracking-[0.16em] text-white/45">
              {tether.taut ? 'Tether taut' : tether.grip ? 'Hand on a rail' : 'Free floating'}
            </p>
            <p className="mono mt-1 text-[9.5px] uppercase tracking-[0.14em] text-white/30">
              WASD · Space up · Shift down
            </p>
          </div>
        )}

        {/* Mission briefing, legible in fullscreen as well. */}
        {!open && showObjectives && (
          <div className="absolute left-3 top-3 w-[min(86vw,19rem)] border border-white/12 bg-black/65 backdrop-blur-sm">
            <button
              onClick={() => setShowObjectives(false)}
              className="flex w-full items-center gap-2 border-b border-white/10 px-3 py-2 text-left"
            >
              <Target className="h-3.5 w-3.5 shrink-0 text-cyan-200/70" />
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
                Mission · {doneCount} of {OBJECTIVES.length}
              </span>
              <span className="mono ml-auto text-[10px] text-white/35">hide</span>
            </button>
            {objective ? (
              <div className="px-3 py-2.5">
                <p className="mono text-[9.5px] uppercase tracking-[0.18em] text-cyan-200/70">{objective.code}</p>
                <p className="mt-0.5 text-[13px] text-white/90">{objective.title}</p>
                <p className="mt-1 text-[11px] leading-snug text-white/50">{objective.brief}</p>
                <ul className="mt-2 space-y-1">
                  {objective.tasks.map((t) => {
                    const ok = done.includes(t.id)
                    return (
                      <li key={t.id} className={`flex items-start gap-2 text-[11.5px] ${ok ? 'text-white/80' : 'text-white/45'}`}>
                        <span className={`mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center border ${ok ? 'border-emerald-300/70 text-emerald-300/90' : 'border-white/25'}`}>
                          {ok && <Check className="h-2 w-2" />}
                        </span>
                        <span>{t.label}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mono mt-2 text-[9.5px] uppercase tracking-[0.16em] text-white/30">
                  Educational objectives · synthetic data
                </p>
              </div>
            ) : (
              <div className="px-3 py-3">
                <p className="text-[12.5px] text-emerald-300/85">All objectives complete.</p>
                <p className="mt-1 text-[11px] leading-snug text-white/45">
                  Nothing here establishes anything clinical. It is a walk-through of how the
                  instruments are used.
                </p>
              </div>
            )}
          </div>
        )}
        {!open && !showObjectives && (
          <button
            onClick={() => setShowObjectives(true)}
            className="absolute left-3 top-3 flex items-center gap-2 border border-white/12 bg-black/65 px-3 py-2 backdrop-blur-sm"
          >
            <Target className="h-3.5 w-3.5 text-cyan-200/70" />
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
              {doneCount}/{OBJECTIVES.length}
            </span>
          </button>
        )}

        {/* Graphics quality and fullscreen. */}
        {!open && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <div className="flex items-center border border-white/12 bg-black/65 backdrop-blur-sm">
              <span className="mono flex items-center gap-1 px-2 py-1.5 text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                <Gauge className="h-3 w-3" />
                {Math.round(1000 / Math.max(1, frameMs))} fps
              </span>
              {QUALITY_ORDER.map((q) => (
                <button
                  key={q}
                  onClick={() => applyQuality(q)}
                  aria-pressed={quality === q}
                  title={`${q} graphics`}
                  className={`mono border-l border-white/10 px-2 py-1.5 text-[9.5px] uppercase tracking-[0.16em] transition-colors ${
                    quality === q ? 'text-cyan-200' : 'text-white/40 hover:text-white/75'
                  }`}
                >
                  {q[0]}
                </button>
              ))}
              {!autoQuality && (
                <button
                  onClick={() => setAutoQuality(true)}
                  title="Let the governor choose again"
                  className="mono border-l border-white/10 px-2 py-1.5 text-[9.5px] uppercase tracking-[0.16em] text-white/40 hover:text-white/75"
                >
                  auto
                </button>
              )}
            </div>
            <button
              onClick={toggleFullscreen}
              title={full ? 'Exit fullscreen (Esc)' : 'Fullscreen (F)'}
              className="border border-white/12 bg-black/65 p-1.5 text-white/55 backdrop-blur-sm transition-colors hover:text-white"
            >
              {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {/* The entry plate, once. After that the station stays where it was. */}
        {overlay === 'plate' && (
          <button
            onClick={() => canvasRef.current?.requestPointerLock?.()}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center backdrop-blur-[2px]"
          >
            <p className="mono text-[10.5px] uppercase tracking-[0.22em] text-cyan-200/70">AURORA · Orbital research station</p>
            <p className="display mt-2 text-[clamp(1.6rem,3.4vw,2.6rem)] text-white">Step aboard</p>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-white/55">
              Click to take the controls. <span className="mono">W A S D</span> to move,
              <span className="mono"> Shift</span> to hurry, mouse to look,
              <span className="mono"> E</span> at a console, <span className="mono">F</span> for fullscreen.
              <span className="mono"> Esc</span> releases the pointer.
            </p>
          </button>
        )}

        {/* Afterwards: a quiet prompt that does not cover the station. */}
        {overlay === 'prompt' && (
          <button
            onClick={() => canvasRef.current?.requestPointerLock?.()}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 border border-white/15 bg-black/60 px-3 py-1.5 backdrop-blur-sm transition-colors hover:border-white/35"
          >
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/60">Click to take the controls again</span>
          </button>
        )}

        {/* EVA screens. Shown over the station rather than instead of it, so
            a crew member stays where they are while reading one. */}
        {evaPanel && (
          <div className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,26rem)] flex-col border-l border-border bg-bg/95 backdrop-blur-sm">
            <button
              onClick={() => setEvaPanel(null)}
              className="flex items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-fg/5"
            >
              <X className="h-3.5 w-3.5 text-muted" />
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted">Close · Esc</span>
            </button>
            <div className="min-h-0 flex-1">
              {evaPanel === 'suit' && <SuitPanel prep={prep} onChange={setPrep} />}
              {evaPanel === 'airlock' && (
                <AirlockPanel
                  airlock={airlock}
                  ready={prepComplete(prep)}
                  onCommand={(c) => runCommandRef.current?.(c)}
                />
              )}
              {evaPanel === 'post' && (
                <PostEvaPanel
                  seconds={airlock.evaSeconds}
                  steps={evaSteps}
                  onReview={() => {
                    // The review itself is a procedure at the medical console;
                    // this only takes the crew member there. The task closes
                    // when its steps are performed, not when it is opened.
                    setEvaPanel(null)
                    openStationRef.current?.('medical')
                  }}
                />
              )}
              {evaPanel && EVA_TASK_BY_ID[evaPanel as EvaTaskId] && (
                <WorksitePanel
                  task={EVA_TASK_BY_ID[evaPanel as EvaTaskId]}
                  done={evaSteps}
                  tools={prep.tools}
                  onStep={(key) => {
                    setEvaSteps((prev) => {
                      if (prev.includes(key)) return prev
                      const next = [...prev, key]
                      saveSteps([...procDone, ...next])
                      return next
                    })
                  }}
                />
              )}
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="annotate text-white/50">BRINGING THE STATION UP…</p>
          </div>
        )}

        {touch && !open && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 border-t border-white/10 bg-black/60 p-2 backdrop-blur-sm">
            <span className="mono w-full pb-1 text-[9.5px] uppercase tracking-[0.18em] text-white/40">
              Drag to look · tap a bay to walk there · tap it again to use the console
            </span>
            {STATIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => (promptRef.current?.id === s.id ? openStationRef.current?.(s.id) : travelTo(s.id))}
                className="mono border border-white/20 px-2 py-1 text-[10px] uppercase tracking-wider text-white/70"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* The console screen, shown in place once the camera has settled. */}
        {open && (
          <StationModal
            id={open}
            onClose={closeStation}
            onLeave={leave}
            onTask={markTask}
            zoomed
            procDone={procDone}
            onProcStep={markProcStep}
            evaDone={airlock.evaSeconds > 0}
            evaSeconds={airlock.evaSeconds}
          />
        )}
      </div>

      {!touch && !full && (
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
          <span className="annotate ml-auto shrink-0">{ROOMS.length} MODULES · {STATIONS.length} CONSOLES</span>
        </div>
      )}
    </div>
  )
}

/**
 * A console screen. Once the camera has flown onto the console this renders
 * inside the canvas frame rather than as a dialog over the page, so the
 * instrument is read where it physically sits.
 */
function StationModal({
  id,
  onClose,
  onLeave,
  onTask,
  zoomed,
  procDone,
  onProcStep,
  evaDone,
  evaSeconds,
}: {
  id: StationId
  onClose: () => void
  onLeave: (page: PageId) => void
  onTask: (t: TaskId) => void
  zoomed: boolean
  procDone: readonly string[]
  onProcStep: (key: string) => void
  evaDone: boolean
  evaSeconds: number
}) {
  const s = STATION_BY_ID[id]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Reaching a console is the first task of several objectives.
  useEffect(() => {
    if (id === 'medical') onTask('open-medical')
    if (id === 'crew') onTask('open-crew')
    if (id === 'environment') onTask('open-environment')
    if (id === 'navigation') onTask('open-navigation')
    if (id === 'comms') onTask('open-comms')
    if (id === 'research') onTask('open-research')
  }, [id, onTask])

  const frame = zoomed
    ? 'absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-3 sm:p-6'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm'

  return (
    <div className={frame} role="dialog" aria-modal="true" aria-label={s.label}>
      <div className="flex max-h-full w-full max-w-4xl flex-col border border-cyan-300/25 bg-neutral-950/96 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">{s.bay}</p>
            <h2 className="display mt-0.5 text-[1.5rem] text-white">{s.label}</h2>
          </div>
          <button onClick={onClose} aria-label="Step back from the console" className="mt-1 text-white/50 transition-colors hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <StationContent
            id={id}
            onLeave={onLeave}
            onTask={onTask}
            procDone={procDone}
            onProcStep={onProcStep}
            evaDone={evaDone}
            evaSeconds={evaSeconds}
          />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-2.5">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Synthetic crew data · not a medical device
          </p>
          <button
            onClick={onClose}
            className="mono ml-auto border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/65 transition-colors hover:border-white/45 hover:text-white"
          >
            Step back · Esc
          </button>
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
