import type { ToolId } from './suit'

/**
 * The spacewalk: where a crew member can go outside, and what there is to do.
 *
 * Two rules shape this module. The first is that an objective must never
 * complete by being approached — proximity makes a worksite *available*, and
 * the work itself is a sequence of steps each of which has to be performed.
 * The second is that the preparation inside has to matter once you are
 * outside: several steps below name a tool, and if that tool was not taken
 * from the rack during suit prep the step refuses, which is the only way a
 * tool selection screen is anything more than decoration.
 *
 * ── On realism ────────────────────────────────────────────────────────────
 * The structures are modelled on the ISS truss layout at the level of what is
 * mounted where — arrays outboard, radiators amidships, antennas on the zenith
 * side, handrails along every translation path. Distances are compressed and
 * the station here is much smaller than the real one. The faults are invented
 * scenarios for the exercise. No orbital mechanics, no real attitude, no
 * thermal or power model: a worksite readout is a scripted string, labelled as
 * simulated wherever it is shown.
 */

export interface Worksite {
  id: EvaTaskId
  /** Where the work happens, in the same world frame as the interior. */
  x: number
  y: number
  z: number
  /** How close a crew member has to be for the work to become available. */
  reach: number
  label: string
}

export type EvaTaskId = 'eva-01' | 'eva-02' | 'eva-03' | 'eva-04' | 'eva-05'

export interface EvaStep {
  id: string
  label: string
  /** What the crew member sees when the step is done. */
  result: string
  /** A tool that must have been taken during suit preparation. */
  needs?: ToolId
}

export interface EvaTask {
  id: EvaTaskId
  code: string
  title: string
  brief: string
  site: Worksite
  steps: EvaStep[]
}

/**
 * Where the outer hatch puts a crew member, and the tether's anchor.
 *
 * Outboard of the crew lock's hull, not level with its hatch: the first
 * version of this put the egress point a metre inside the module's own
 * exterior mesh, so a crew member stepping out began the spacewalk inside the
 * wall they had just come through.
 */
export const EGRESS = { x: -12.9, y: 1.4, z: -21.7 }

const SITES: Record<EvaTaskId, Worksite> = {
  'eva-01': { id: 'eva-01', x: -30.5, y: 7.4, z: -4.0, reach: 4.2, label: 'Port solar array, blanket box 2' },
  'eva-02': { id: 'eva-02', x: 11.2, y: 2.1, z: -21.0, reach: 3.4, label: 'Research module hull, sensor mount S4' },
  'eva-03': { id: 'eva-03', x: 1.8, y: 11.6, z: 6.5, reach: 3.6, label: 'Zenith antenna boom' },
  'eva-04': { id: 'eva-04', x: -13.6, y: 7.2, z: -2.2, reach: 3.4, label: 'Truss cable run, bay 3' },
  'eva-05': { id: 'eva-05', x: 18.4, y: 6.0, z: 1.5, reach: 4.0, label: 'Starboard radiator panel 2' },
}

/**
 * Safety tether length, metres.
 *
 * Derived from the worksites rather than written in, with a margin, so that
 * every task is reachable by construction. The first version of this was a
 * literal, and it was both too long to ever be the binding constraint and too
 * short to reach the starboard radiator — a tether that could not be used
 * and could not do its job, at the same time. A test asserts the derivation
 * against each worksite, so moving one cannot quietly strand it.
 *
 * A real safety tether is shorter and is used alongside local tethers and
 * hand-over-hand translation; this single long one stands in for all of that,
 * and the HUD says so when it goes taut.
 */
export const TETHER_LENGTH = (() => {
  let far = 0
  for (const t of Object.values(SITES)) {
    far = Math.max(far, Math.hypot(t.x - EGRESS.x, t.y - EGRESS.y, t.z - EGRESS.z))
  }
  return Math.ceil(far + 5)
})()

/**
 * Bounds on the exterior volume, so a crew member cannot drift out of the
 * scene if the tether is ever bypassed. Sized to sit outside the tether in
 * every direction, which makes the tether the constraint a crew member
 * actually meets and leaves this as the backstop it is meant to be.
 */
export const EVA_BOUNDS = {
  x: Math.ceil(Math.abs(EGRESS.x) + TETHER_LENGTH + 2),
  yMin: Math.floor(EGRESS.y - TETHER_LENGTH - 2),
  yMax: Math.ceil(EGRESS.y + TETHER_LENGTH + 2),
  z: Math.ceil(Math.abs(EGRESS.z) + TETHER_LENGTH + 2),
}


export const EVA_TASKS: EvaTask[] = [
  {
    id: 'eva-01',
    code: 'EVA-01',
    title: 'Solar array inspection',
    brief:
      'String 2B has been reporting below its neighbours for four days. Translate out to the port array and find out whether the shortfall is damage or shadowing.',
    site: SITES['eva-01'],
    steps: [
      { id: 'survey', label: 'Survey the blanket for damage', result: 'A puncture about 8 mm across in cell row 14, with the characteristic lip of a micrometeoroid strike.' },
      { id: 'mirror', label: 'Inspect the strike from behind', needs: 'scoop', result: 'Mirror confirms the exit side. The strike passed through the blanket; the substrate behind is scored but intact.' },
      { id: 'readout', label: 'Read the string current at the local panel', result: 'String 2B reads 7.9 A against 9.4 A on 2A. Simulated reading. The shortfall matches the loss of one cell row.' },
      { id: 'record', label: 'Record the finding for the mission log', result: 'Logged: single strike, one row lost, no propagation risk. No replacement required this increment.' },
    ],
  },
  {
    id: 'eva-02',
    code: 'EVA-02',
    title: 'External sensor replacement',
    brief:
      'The S4 radiation sensor on the research module has been dropping out intermittently. Remove it and install the spare carried out in the tool bag.',
    site: SITES['eva-02'],
    steps: [
      { id: 'inspect', label: 'Inspect the mounting', result: 'Mount is sound. The intermittent fault tracks with thermal cycling at the connector, not the bracket.' },
      { id: 'bolts', label: 'Release the captive bolts', needs: 'pgt', result: 'Both captive bolts backed off and left in the fitting. Nothing released into the volume.' },
      { id: 'demate', label: 'Demate the connector', needs: 'wire-cutter', result: 'Connector demated. Two pins show the discolouration of a cold joint, which is the fault.' },
      { id: 'tether-old', label: 'Tether the removed unit', needs: 'tether-short', result: 'Old sensor on the equipment tether and stowed in the bag. Nothing adrift.' },
      { id: 'install', label: 'Install the replacement', result: 'Spare seated on the mount and mated. Connector keyed correctly on the first attempt.' },
      { id: 'torque', label: 'Torque the bolts to spec', needs: 'pgt', result: 'Both bolts to the specified torque. Tool reports both cycles complete.' },
      { id: 'verify', label: 'Verify the sensor reports', result: 'Simulated telemetry: S4 reporting continuously, counts in family with S3. Fault cleared.' },
    ],
  },
  {
    id: 'eva-03',
    code: 'EVA-03',
    title: 'Antenna maintenance',
    brief:
      'The zenith antenna has been losing lock during part of each orbit. Inspect the boom and find what moves when it is warm.',
    site: SITES['eva-03'],
    steps: [
      { id: 'inspect', label: 'Inspect the boom assembly', result: 'A clamp on the waveguide run has backed off. The run can move several millimetres by hand.' },
      { id: 'identify', label: 'Identify the fault', result: 'Movement at the clamp matches the loss of lock: the run shifts as the boom warms through the terminator.' },
      { id: 'reseat', label: 'Reseat and torque the clamp', needs: 'pgt', result: 'Clamp reseated on the waveguide and torqued. No movement left in the run.' },
      { id: 'confirm', label: 'Confirm the repair', result: 'Simulated link check: signal steady through a simulated terminator crossing. Lock held.' },
    ],
  },
  {
    id: 'eva-04',
    code: 'EVA-04',
    title: 'External cable repair',
    brief:
      'A power feed along truss bay 3 is showing resistance at one connector. Fit the jumper rather than replacing the whole run.',
    site: SITES['eva-04'],
    steps: [
      { id: 'locate', label: 'Locate the cable run', result: 'Run identified by its labels. The suspect connector is the second from the outboard end.' },
      { id: 'inspect', label: 'Inspect the connector', needs: 'scoop', result: 'Mirror shows the backshell strain relief has pulled, putting load on the pins. That is the resistance.' },
      { id: 'demate', label: 'Demate the faulty connector', needs: 'wire-cutter', result: 'Connector demated and capped. The pins are serviceable; the strain relief is not.' },
      { id: 'jumper', label: 'Install the jumper', result: 'Jumper installed across the break, both ends mated and keyed.' },
      { id: 'clamp', label: 'Secure the cable', needs: 'pgt', result: 'Run clamped either side of the jumper so no load reaches the connector.' },
      { id: 'status', label: 'Confirm the feed', result: 'Simulated reading: feed carrying nominal current, no resistance signature. Repair holds.' },
    ],
  },
  {
    id: 'eva-05',
    code: 'EVA-05',
    title: 'Radiator inspection',
    brief:
      'Starboard radiator panel 2 has been rejecting less heat than its pair. Inspect it and report before anyone plans a bigger job.',
    site: SITES['eva-05'],
    steps: [
      { id: 'navigate', label: 'Survey the panel face', result: 'Panel face intact. No strikes, no delamination, no contamination on the coating.' },
      { id: 'flow', label: 'Check the flow readout', result: 'Simulated reading: ammonia flow 14% below its pair, inlet and outlet temperatures close together.' },
      { id: 'inspect', label: 'Inspect the flow control valve', needs: 'scoop', result: 'Valve body shows frost at the actuator — it is not travelling fully open. The panel is fine; the valve is not.' },
      { id: 'report', label: 'File the maintenance report', result: 'Reported: panel serviceable, flow control valve suspect. Recommended for a planned EVA, not an urgent one.' },
    ],
  },
]

export const EVA_TASK_BY_ID = Object.fromEntries(EVA_TASKS.map((t) => [t.id, t])) as Record<EvaTaskId, EvaTask>

/** Every step id, qualified by its task, as recorded in mission progress. */
export function stepKey(task: EvaTaskId, step: string): string {
  return `${task}:${step}`
}

export const ALL_EVA_STEPS: string[] = EVA_TASKS.flatMap((t) => t.steps.map((s) => stepKey(t.id, s.id)))

export function taskComplete(t: EvaTask, done: readonly string[]): boolean {
  return t.steps.every((s) => done.includes(stepKey(t.id, s.id)))
}

/**
 * The next step of a task, or null when it is finished. Steps are strictly
 * ordered: a crew member cannot torque a bolt that has not been released.
 */
export function nextStep(t: EvaTask, done: readonly string[]): EvaStep | null {
  for (const s of t.steps) if (!done.includes(stepKey(t.id, s.id))) return s
  return null
}

/** The worksite within reach, if any. */
export function siteInReach(x: number, y: number, z: number): EvaTask | null {
  let best: EvaTask | null = null
  let bestD = Infinity
  for (const t of EVA_TASKS) {
    const d = Math.hypot(t.site.x - x, t.site.y - y, t.site.z - z)
    if (d <= t.site.reach && d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

/** Distance from the tether anchor. */
export function tetherDistance(x: number, y: number, z: number): number {
  return Math.hypot(x - EGRESS.x, y - EGRESS.y, z - EGRESS.z)
}

/**
 * Hold a crew member inside the tether.
 *
 * A tether does not brake: it runs out and then it holds, so this clamps the
 * position back onto the sphere rather than slowing the approach to it. The
 * caller kills the outward component of velocity, which is what stops a crew
 * member from vibrating against the limit.
 */
export function constrainToTether(x: number, y: number, z: number): { x: number; y: number; z: number; taut: boolean } {
  const dx = x - EGRESS.x
  const dy = y - EGRESS.y
  const dz = z - EGRESS.z
  const d = Math.hypot(dx, dy, dz)

  let px = x
  let py = y
  let pz = z
  if (d > TETHER_LENGTH) {
    const k = TETHER_LENGTH / d
    px = EGRESS.x + dx * k
    py = EGRESS.y + dy * k
    pz = EGRESS.z + dz * k
  }
  // The volume clamp applies on both paths. It used to be inside the slack
  // branch only, which meant a crew member at full tether could be projected
  // onto the sphere and straight through the ceiling of the scene.
  px = Math.max(-EVA_BOUNDS.x, Math.min(EVA_BOUNDS.x, px))
  py = Math.max(EVA_BOUNDS.yMin, Math.min(EVA_BOUNDS.yMax, py))
  pz = Math.max(-EVA_BOUNDS.z, Math.min(EVA_BOUNDS.z, pz))

  // Taut is reported with a small band rather than as d > L. Projecting onto
  // the sphere leaves the distance exactly at the limit, so a strict test
  // alternates true and false from one frame to the next and the HUD flickers
  // while a crew member leans steadily on the tether.
  return { x: px, y: py, z: pz, taut: d >= TETHER_LENGTH - TAUT_BAND }
}

/** How close to the limit still counts as taut. */
const TAUT_BAND = 0.05

/**
 * Handrails along the exterior translation paths, as line segments. A crew
 * member near one gets a firm hold: movement along it is faster and the drift
 * damping is much higher, which is what translating hand over hand feels like
 * against free-floating.
 */
export const HANDRAILS: { a: [number, number, number]; b: [number, number, number] }[] = [
  // Out of the hatch, back along the crew lock and up onto the truss.
  { a: [-12.6, 1.4, -21.7], b: [-10.0, 2.6, -21.7] },
  { a: [-10.0, 2.6, -21.7], b: [-9.6, 6.2, -21.7] },
  { a: [-9.6, 6.2, -21.7], b: [-10.4, 6.9, -6.0] },
  // Along the truss, port and starboard.
  { a: [-10.4, 6.9, -2.0], b: [-28.0, 7.4, -2.0] },
  { a: [-10.4, 6.9, -2.0], b: [10.4, 6.9, -2.0] },
  { a: [10.4, 6.9, -2.0], b: [17.6, 6.4, 0.6] },
  // Up to the antenna boom.
  { a: [1.8, 7.0, 2.0], b: [1.8, 10.8, 5.6] },
  // Down the starboard hull to the research module sensor mount.
  { a: [10.4, 6.9, -6.0], b: [10.6, 2.4, -20.2] },
]

/** Distance to the nearest handrail, and whether that is a hold. */
export function handrailGrip(x: number, y: number, z: number): number {
  let best = Infinity
  for (const { a, b } of HANDRAILS) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
    const apx = x - a[0], apy = y - a[1], apz = z - a[2]
    const len2 = abx * abx + aby * aby + abz * abz || 1
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2))
    const d = Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t)
    if (d < best) best = d
  }
  return best
}

/** Within this distance of a rail, a crew member has a hold on it. */
export const GRIP_RANGE = 1.5

// ------------------------------------------------------- interaction points
/**
 * Places inside the vessel where the EVA system is operated.
 *
 * Deliberately not added to `STATIONS` in the deck plan: those six are the
 * AURORA consoles, the mission objectives count them, and quietly growing that
 * list to eight would have changed what "open every console" means. These are
 * their own thing, with their own prompt.
 */
export type EvaPointId = 'suit-rack' | 'airlock-control'

export interface EvaPoint {
  id: EvaPointId
  label: string
  hint: string
  x: number
  z: number
  /** How close, and roughly looked at, a crew member has to be. */
  range: number
}

export const EVA_POINTS: EvaPoint[] = [
  {
    id: 'suit-rack',
    label: 'Suit preparation',
    hint: 'Inspect, check and don an extravehicular suit',
    x: -7.0,
    z: -22.5,
    range: 2.6,
  },
  {
    id: 'airlock-control',
    label: 'Airlock control',
    hint: 'Hatches, pressure and the egress sequence',
    x: -10.0,
    z: -21.0,
    range: 2.4,
  },
]

/** The EVA point a crew member is addressing, by the same rule as a console. */
export function evaPointInReach(x: number, z: number, yaw: number): EvaPoint | null {
  let best: EvaPoint | null = null
  let bestScore = -Infinity
  for (const p of EVA_POINTS) {
    const dx = p.x - x
    const dz = p.z - z
    const dist = Math.hypot(dx, dz)
    if (dist > p.range) continue
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const facing = (dx * fx + dz * fz) / (dist || 1)
    if (facing < 0.2) continue
    const score = facing - dist * 0.1
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

// ------------------------------------------------------------ EVA movement
/**
 * One step of free-fall movement outside.
 *
 * Nothing about this is the interior walk with gravity switched off. A crew
 * member outside has no footing: thrust comes from pushing off or pulling
 * along a handrail, there is no friction to stop them, and the only things
 * that bound the motion are the tether and their own grip. So velocity
 * persists, input accelerates rather than sets speed, and the damping depends
 * entirely on whether a rail is within reach — close to one a crew member can
 * check their drift almost at once, and away from one they very nearly cannot.
 *
 * Deliberately not a physics engine: no mass, no inertia tensor, no contact
 * model. It is the smallest model that makes handrails matter and makes
 * letting go feel like a decision.
 */
export interface EvaMotion {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export const EVA_THRUST = 3.1
export const EVA_MAX = 3.4

export function stepEva(
  m: EvaMotion,
  /** Desired direction in world space, already normalised, or zeroes. */
  ax: number, ay: number, az: number,
  dt: number,
): EvaMotion & { taut: boolean; grip: boolean } {
  const grip = handrailGrip(m.x, m.y, m.z) < GRIP_RANGE
  // On a rail a crew member can both push harder and stop; off it, neither.
  const thrust = EVA_THRUST * (grip ? 1.35 : 0.75)
  let vx = m.vx + ax * thrust * dt
  let vy = m.vy + ay * thrust * dt
  let vz = m.vz + az * thrust * dt

  // Damping: a hand on a rail is most of what stops you.
  const damp = Math.exp(-(grip ? 3.4 : 0.22) * dt)
  vx *= damp; vy *= damp; vz *= damp

  const sp = Math.hypot(vx, vy, vz)
  if (sp > EVA_MAX) {
    const k = EVA_MAX / sp
    vx *= k; vy *= k; vz *= k
  }

  const nx = m.x + vx * dt
  const ny = m.y + vy * dt
  const nz = m.z + vz * dt
  const held = constrainToTether(nx, ny, nz)
  if (held.taut) {
    // The tether holds rather than brakes: kill only the outward component,
    // so a crew member at the end of it can still swing around the anchor.
    const ox = held.x - EGRESS.x
    const oy = held.y - EGRESS.y
    const oz = held.z - EGRESS.z
    const len = Math.hypot(ox, oy, oz) || 1
    const radial = (vx * ox + vy * oy + vz * oz) / len
    if (radial > 0) {
      vx -= (ox / len) * radial
      vy -= (oy / len) * radial
      vz -= (oz / len) * radial
    }
  }
  return { x: held.x, y: held.y, z: held.z, vx, vy, vz, taut: held.taut, grip }
}
