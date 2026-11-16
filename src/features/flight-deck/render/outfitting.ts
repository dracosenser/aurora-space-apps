import {
  ALLOY, AMBER_L, BAG, BAG_2, CABLE, DARKMETAL, GRATE, LABEL, M_METAL, M_PANEL,
  M_RAIL, M_RUBBER, M_SOFT, PANEL, PANEL_2, PEACH, PEACH_DK, RAIL,
  boxPts, rnd, type Builder, type Mat, type P3, type Rgb,
} from './geometry'
import { DOORS, ROOMS } from '../model/deck'
import { SUITS } from '../model/suit'

/**
 * The things in the vessel, as opposed to the vessel itself.
 *
 * `geometry.ts` builds the pressure shell, the rack bays and the deck. This
 * module fills it: the extravehicular suits on their racks, the hatches, the
 * cable runs, the stowage, the galley, the exercise hardware, the seats and
 * the workstations. It is kept separate because it is a different kind of
 * problem — shell geometry is parametric over the deck plan, and this is a
 * list of objects at places.
 *
 * ── On realism ────────────────────────────────────────────────────────────
 * Everything here is modelled from published imagery of the ISS US segment at
 * the level of layout and proportion. Nothing is traced from an asset, no
 * agency marking or insignia is reproduced, and no module carries a real
 * flight designation.
 */

// -------------------------------------------------------- extra materials
const FABRIC: Rgb = [0.74, 0.735, 0.715]
const FABRIC_DK: Rgb = [0.40, 0.405, 0.42]
const GOLD: Rgb = [0.62, 0.45, 0.14]
const RED_STRIPE: Rgb = [0.46, 0.055, 0.045]
const GLASS: Rgb = [0.05, 0.07, 0.09]
const FOODBAG: Rgb = [0.70, 0.66, 0.50]
const FOODBAG_2: Rgb = [0.52, 0.56, 0.60]
const GREEN_L: Rgb = [0.10, 0.52, 0.22]
const SEAT: Rgb = [0.18, 0.19, 0.22]

/** Suit fabric: the beta cloth outer layer is matte and slightly uneven. */
const M_FABRIC: Mat = [0.93, 0.0, 1]
/** Hard composite: the torso shell and helmet, smoother than fabric. */
const M_SHELL: Mat = [0.42, 0.0, 1]
const M_GLASS: Mat = [0.08, 0.1, 1]
const M_GOLD: Mat = [0.22, 0.95, 1]

// =========================================================== suit geometry
/**
 * One extravehicular mobility unit on its rack.
 *
 * Built as the real garment is assembled rather than as a single silhouette:
 * a lower torso of fabric with knee and ankle joints, a hard upper torso in
 * composite, arms with scye and wrist bearings, gloves, a helmet with a
 * pressure bubble and a gold-coated sun visor, and the life support backpack
 * behind. The distinction matters for the material response — fabric, hard
 * shell, rubber seal and gold-film visor all catch light differently, and
 * those differences are most of what makes it read as a suit.
 *
 * `facing` is the direction the suit's chest points.
 */
function suit(b: Builder, x: number, z: number, facing: number, stripe: 'none' | 'red' | 'broken-red', seed: number): void {
  const c = Math.cos(facing)
  const s = Math.sin(facing)
  /** Suit-local to world: lx across the chest, ly up, lz out of the chest. */
  const P = (lx: number, ly: number, lz: number): P3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c]
  const R = (k: number) => rnd(seed * 3.31 + k * 7.77)

  // ---- lower torso assembly: legs and boots, in fabric
  for (const side of [-1, 1] as const) {
    const hx = side * 0.14
    // Thigh, shin, each a slightly different width so the leg tapers.
    b.box(...boxPts(P(hx - 0.115, 0.46, -0.11), P(hx + 0.115, 0.92, 0.12)), FABRIC, M_FABRIC)
    b.box(...boxPts(P(hx - 0.10, 0.12, -0.10), P(hx + 0.10, 0.48, 0.11)), FABRIC, M_FABRIC)
    // Knee joint: convolute rings, which is what a pressure joint looks like.
    for (let i = 0; i < 3; i++) {
      const yy = 0.44 + i * 0.035
      b.box(...boxPts(P(hx - 0.115, yy, -0.115), P(hx + 0.115, yy + 0.02, 0.125)), FABRIC_DK, M_RUBBER)
    }
    // Ankle convolute and boot.
    b.box(...boxPts(P(hx - 0.1, 0.1, -0.105), P(hx + 0.1, 0.13, 0.115)), FABRIC_DK, M_RUBBER)
    b.box(...boxPts(P(hx - 0.105, 0.0, -0.115), P(hx + 0.105, 0.11, 0.2)), FABRIC_DK, M_SHELL)
    // Boot sole, darker and separate.
    b.box(...boxPts(P(hx - 0.105, 0.0, -0.115), P(hx + 0.105, 0.025, 0.2)), DARKMETAL, [0.8, 0, 1])
  }
  // Waist ring: where the lower torso mates to the hard upper torso.
  b.box(...boxPts(P(-0.185, 0.92, -0.135), P(0.185, 0.975, 0.15)), ALLOY, M_METAL)
  for (let i = 0; i < 8; i++) {
    const u = -0.17 + (i * 0.34) / 7
    b.box(...boxPts(P(u - 0.014, 0.925, 0.15), P(u + 0.014, 0.968, 0.166)), ALLOY, M_METAL)
  }

  // ---- hard upper torso: the composite shell
  b.box(...boxPts(P(-0.215, 0.975, -0.15), P(0.215, 1.38, 0.17)), FABRIC, M_SHELL)
  // Chest-mounted display and control module, worn on the front.
  b.box(...boxPts(P(-0.15, 1.12, 0.17), P(0.15, 1.30, 0.235)), PANEL_2, M_PANEL)
  b.quad(P(-0.125, 1.185, 0.236), P(-0.125, 1.275, 0.236), P(0.045, 1.275, 0.236), P(0.045, 1.185, 0.236), DARKMETAL, [0.3, 0.2, 1])
  for (let i = 0; i < 6; i++) {
    const u = -0.12 + (i % 3) * 0.055
    const yy = 1.135 + Math.floor(i / 3) * 0.03
    b.box(...boxPts(P(u, yy, 0.236), P(u + 0.03, yy + 0.022, 0.248)), i === 1 ? AMBER_L : ALLOY, M_METAL)
  }
  // Oxygen and water umbilical fittings on the lower chest.
  for (const u of [-0.11, 0.11]) {
    b.box(...boxPts(P(u - 0.035, 1.0, 0.17), P(u + 0.035, 1.07, 0.235)), ALLOY, M_METAL)
    b.box(...boxPts(P(u - 0.022, 1.015, 0.235), P(u + 0.022, 1.055, 0.262)), CABLE, M_RUBBER)
  }

  // ---- arms, with scye and wrist bearings
  for (const side of [-1, 1] as const) {
    const sx = side * 0.245
    // Scye bearing where the arm meets the torso.
    b.box(...boxPts(P(sx - 0.05 * side - 0.035, 1.22, -0.085), P(sx + 0.035, 1.33, 0.1)), ALLOY, M_METAL)
    // Upper arm and forearm.
    b.box(...boxPts(P(sx - 0.075, 1.04, -0.085), P(sx + 0.075, 1.25, 0.1)), FABRIC, M_FABRIC)
    b.box(...boxPts(P(sx - 0.07, 0.84, -0.075), P(sx + 0.07, 1.06, 0.095)), FABRIC, M_FABRIC)
    // Elbow convolute.
    for (let i = 0; i < 3; i++) {
      b.box(...boxPts(P(sx - 0.078, 1.03 + i * 0.03, -0.09), P(sx + 0.078, 1.048 + i * 0.03, 0.105)), FABRIC_DK, M_RUBBER)
    }
    // Wrist bearing, then the glove: a cuff, a palm and four fingers.
    b.box(...boxPts(P(sx - 0.058, 0.80, -0.062), P(sx + 0.058, 0.845, 0.082)), ALLOY, M_METAL)
    b.box(...boxPts(P(sx - 0.055, 0.70, -0.06), P(sx + 0.055, 0.805, 0.08)), FABRIC_DK, M_SHELL)
    for (let f = 0; f < 4; f++) {
      const fx = sx - 0.042 + f * 0.028
      b.box(...boxPts(P(fx - 0.011, 0.645, -0.03), P(fx + 0.011, 0.705, 0.045)), FABRIC_DK, M_SHELL)
    }
    // Thumb, offset and shorter.
    b.box(...boxPts(P(sx + side * 0.05 - 0.012, 0.675, 0.015), P(sx + side * 0.05 + 0.012, 0.73, 0.07)), FABRIC_DK, M_SHELL)
  }

  // ---- helmet: neck ring, pressure bubble, sun visor
  b.box(...boxPts(P(-0.095, 1.38, -0.075), P(0.095, 1.425, 0.1)), ALLOY, M_METAL)
  // The bubble, approximated as a faceted dome so it catches light on facets.
  const hy = 1.43
  const hr = 0.135
  const seg = 10
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2
    const a1 = ((i + 1) / seg) * Math.PI * 2
    for (let j = 0; j < 4; j++) {
      const t0 = (j / 4) * (Math.PI / 2)
      const t1 = ((j + 1) / 4) * (Math.PI / 2)
      const p = (a: number, t: number): P3 =>
        P(Math.cos(a) * hr * Math.cos(t), hy + Math.sin(t) * hr * 1.15, Math.sin(a) * hr * Math.cos(t) + 0.012)
      b.quad(p(a0, t0), p(a0, t1), p(a1, t1), p(a1, t0), GLASS, M_GLASS)
    }
  }
  // Gold-coated sun visor, pushed up over the back of the helmet.
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * 0.15 + (i / seg) * Math.PI * 0.7
    const a1 = Math.PI * 0.15 + ((i + 1) / seg) * Math.PI * 0.7
    const p = (a: number, r: number, yy: number): P3 => P(Math.cos(a) * r, yy, Math.sin(a) * r * 0.8 - 0.045)
    b.quad(p(a0, hr + 0.025, hy + 0.06), p(a0, hr + 0.025, hy + 0.165), p(a1, hr + 0.025, hy + 0.165), p(a1, hr + 0.025, hy + 0.06), GOLD, M_GOLD)
  }
  // Helmet lights and camera bracket on the sides.
  for (const side of [-1, 1] as const) {
    b.box(...boxPts(P(side * 0.145 - 0.03, 1.5, -0.02), P(side * 0.145 + 0.03, 1.56, 0.06)), ALLOY, M_METAL)
    b.box(...boxPts(P(side * 0.145 - 0.02, 1.512, 0.06), P(side * 0.145 + 0.02, 1.548, 0.078)), [0.85, 0.84, 0.78], M_SOFT)
  }

  // ---- primary life support subsystem, on the back
  b.box(...boxPts(P(-0.23, 0.96, -0.42), P(0.23, 1.44, -0.15)), FABRIC, M_SHELL)
  // Backpack detail: access panel, latches, relief valve, labels.
  b.quad(P(-0.195, 1.0, -0.421), P(-0.195, 1.4, -0.421), P(0.195, 1.4, -0.421), P(0.195, 1.0, -0.421), PANEL_2, M_PANEL)
  for (const u of [-0.16, 0.16]) {
    b.box(...boxPts(P(u - 0.025, 1.05, -0.45), P(u + 0.025, 1.12, -0.415)), ALLOY, M_METAL)
    b.box(...boxPts(P(u - 0.025, 1.28, -0.45), P(u + 0.025, 1.35, -0.415)), ALLOY, M_METAL)
  }
  b.box(...boxPts(P(-0.04, 1.15, -0.455), P(0.04, 1.23, -0.415)), ALLOY, M_METAL)
  b.quad(P(-0.12, 1.42, -0.42), P(-0.12, 1.44, -0.42), P(0.12, 1.44, -0.42), P(0.12, 1.42, -0.42), LABEL, M_SOFT)
  // Secondary oxygen pack below the main backpack.
  b.box(...boxPts(P(-0.17, 0.86, -0.38), P(0.17, 0.97, -0.17)), PANEL_2, M_SHELL)

  // ---- crew identification stripes, by their real convention
  if (stripe !== 'none') {
    const n = stripe === 'red' ? 1 : 3
    for (const leg of [-1, 1] as const) {
      for (let i = 0; i < n; i++) {
        const y0 = 0.56 + i * 0.07
        b.box(...boxPts(P(leg * 0.14 - 0.106, y0, -0.101), P(leg * 0.14 + 0.106, y0 + (n === 1 ? 0.12 : 0.04), 0.112)), RED_STRIPE, M_FABRIC)
      }
    }
  }

  // ---- safety tether, coiled on a hip ring
  b.box(...boxPts(P(0.2, 0.96, -0.02), P(0.27, 1.02, 0.07)), ALLOY, M_METAL)
  for (let i = 0; i < 4; i++) {
    const rr = 0.045 + i * 0.012
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2
      const a1 = ((k + 1) / 8) * Math.PI * 2
      b.quad(
        P(0.235 + Math.cos(a0) * rr, 0.99 + Math.sin(a0) * rr, 0.075),
        P(0.235 + Math.cos(a1) * rr, 0.99 + Math.sin(a1) * rr, 0.075),
        P(0.235 + Math.cos(a1) * rr, 0.99 + Math.sin(a1) * rr, 0.088),
        P(0.235 + Math.cos(a0) * rr, 0.99 + Math.sin(a0) * rr, 0.088),
        R(i) > 0.5 ? CABLE : FABRIC_DK, M_RUBBER,
      )
    }
  }
}

/**
 * A suit rack: the frame a suit hangs on, with its service umbilicals,
 * a donning handle and the stencilled marking that identifies it.
 */
function suitRack(b: Builder, x: number, z: number, facing: number, serviceable: boolean): void {
  const c = Math.cos(facing)
  const s = Math.sin(facing)
  const P = (lx: number, ly: number, lz: number): P3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c]

  // Back plate and frame uprights.
  b.quad(P(-0.46, 0.05, -0.5), P(-0.46, 2.25, -0.5), P(0.46, 2.25, -0.5), P(0.46, 0.05, -0.5), PANEL_2, M_PANEL)
  for (const u of [-0.44, 0.44]) {
    b.box(...boxPts(P(u - 0.03, 0.05, -0.52), P(u + 0.03, 2.25, -0.3)), ALLOY, M_METAL)
  }
  // Top rail the suit hangs from, with its hook.
  b.box(...boxPts(P(-0.46, 2.18, -0.5), P(0.46, 2.25, -0.2)), ALLOY, M_METAL)
  b.box(...boxPts(P(-0.035, 1.9, -0.28), P(0.035, 2.2, -0.22)), ALLOY, M_METAL)
  // Service umbilicals: water, oxygen, power, dropping to the backpack.
  for (const [u, col] of [[-0.3, CABLE], [-0.22, RAIL], [0.26, GRATE]] as const) {
    b.box(...boxPts(P(u - 0.022, 1.32, -0.48), P(u + 0.022, 2.1, -0.43)), col as Rgb, M_RUBBER)
    b.box(...boxPts(P(u - 0.032, 1.26, -0.5), P(u + 0.032, 1.34, -0.41)), ALLOY, M_METAL)
  }
  // Donning handle at shoulder height.
  b.box(...boxPts(P(-0.5, 1.45, -0.42), P(-0.42, 1.52, 0.02)), RAIL, M_RAIL)
  // Stencilled marking plate, and a status lamp that is dark when out of service.
  b.quad(P(-0.2, 2.03, -0.49), P(-0.2, 2.14, -0.49), P(0.2, 2.14, -0.49), P(0.2, 2.03, -0.49), LABEL, M_SOFT)
  b.box(...boxPts(P(0.3, 2.04, -0.5), P(0.37, 2.12, -0.46)), serviceable ? GREEN_L : [0.3, 0.07, 0.05], M_SOFT)
  // Boot tray on the deck.
  b.box(...boxPts(P(-0.34, 0.02, -0.45), P(0.34, 0.09, 0.12)), GRATE, M_SOFT)
}

/**
 * The EVA preparation module: suits on their racks, helmet and glove storage,
 * the tool board, tether reels, and a preparation workstation.
 */
export function evaPrepRoom(b: Builder): void {
  const room = ROOMS.find((r) => r.id === 'airlock')
  if (!room) return

  for (let i = 0; i < SUITS.length; i++) {
    const su = SUITS[i]
    // Racks face into the module, off the port wall.
    suitRack(b, su.x - 0.18, su.z, Math.PI / 2, su.serviceable)
    if (su.serviceable) suit(b, su.x + 0.1, su.z, Math.PI / 2, su.stripe, 20 + i * 5)
    else {
      // The unserviceable suit is struck down: torso alone on the rack, the
      // rest in a stowage bag beneath it with a placard.
      b.box(su.x - 0.04, 0.98, su.z - 0.22, su.x + 0.26, 1.4, su.z + 0.22, FABRIC, M_SHELL)
      b.box(su.x - 0.02, 0.1, su.z - 0.3, su.x + 0.36, 0.5, su.z + 0.3, BAG_2, M_SOFT)
      b.box(su.x + 0.1, 1.5, su.z - 0.2, su.x + 0.12, 1.72, su.z + 0.2, AMBER_L, M_SOFT)
    }
  }

  // Helmet shelf on the aft bulkhead, with three helmets stowed in cradles.
  const shelfZ = room.z0 + 0.26
  b.box(-7.8, 1.5, shelfZ, -4.4, 1.58, shelfZ + 0.52, ALLOY, M_METAL)
  b.box(-7.8, 1.1, shelfZ, -4.4, 1.18, shelfZ + 0.52, ALLOY, M_METAL)
  for (let i = 0; i < 3; i++) {
    const hx = -7.5 + i * 1.0
    // Cradle, then the bubble resting in it.
    b.box(hx - 0.17, 1.58, shelfZ + 0.06, hx + 0.17, 1.66, shelfZ + 0.46, GRATE, M_SOFT)
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2
      const a1 = ((k + 1) / 8) * Math.PI * 2
      for (let j = 0; j < 3; j++) {
        const t0 = (j / 3) * (Math.PI / 2)
        const t1 = ((j + 1) / 3) * (Math.PI / 2)
        const pp = (a: number, t: number): P3 => [
          hx + Math.cos(a) * 0.14 * Math.cos(t),
          1.66 + Math.sin(t) * 0.15,
          shelfZ + 0.26 + Math.sin(a) * 0.14 * Math.cos(t),
        ]
        b.quad(pp(a0, t0), pp(a0, t1), pp(a1, t1), pp(a1, t0), GLASS, M_GLASS)
      }
    }
    // Gloves in the bin below, as pairs.
    for (const g of [-0.09, 0.09]) {
      b.box(hx + g - 0.05, 1.18, shelfZ + 0.1, hx + g + 0.05, 1.32, shelfZ + 0.42, FABRIC_DK, M_SHELL)
    }
  }
  // Placards above the shelf.
  for (let i = 0; i < 3; i++) {
    b.quad([-7.68 + i, 1.86, shelfZ + 0.02], [-7.68 + i, 1.96, shelfZ + 0.02], [-7.1 + i, 1.96, shelfZ + 0.02], [-7.1 + i, 1.86, shelfZ + 0.02], LABEL, M_SOFT)
  }

  // Tool board on the forward bulkhead. Not the starboard wall: that side of
  // this module has no wall at all, because the deck plan opens it onto the
  // spine for its whole length, and a board hung there would have floated in
  // the doorway.
  const tz = room.z1 - 0.12
  b.quad([-7.9, 0.95, tz], [-7.9, 2.0, tz], [-5.4, 2.0, tz], [-5.4, 0.95, tz], PANEL_2, M_PANEL)
  const tools: [number, number, number, Rgb][] = [
    [-7.65, 1.75, 0.3, ALLOY], [-7.2, 1.72, 0.26, DARKMETAL], [-6.8, 1.78, 0.22, ALLOY],
    [-7.6, 1.35, 0.2, GRATE], [-7.15, 1.3, 0.3, ALLOY], [-6.7, 1.33, 0.18, DARKMETAL],
    [-6.25, 1.7, 0.24, ALLOY], [-6.1, 1.28, 0.26, GRATE],
  ]
  for (const [x, y, len, col] of tools) {
    b.box(x - 0.045, y - len / 2, tz - 0.11, x + 0.045, y + len / 2, tz - 0.02, col, M_METAL)
    // Retaining clip.
    b.box(x - 0.055, y - 0.02, tz - 0.13, x + 0.055, y + 0.02, tz - 0.01, ALLOY, M_METAL)
  }
  // Tether reels below the board.
  for (let i = 0; i < 3; i++) {
    const x = -7.5 + i * 0.7
    b.box(x - 0.14, 0.5, tz - 0.19, x + 0.14, 0.84, tz - 0.02, PANEL, M_PANEL)
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2
      const a1 = ((k + 1) / 10) * Math.PI * 2
      b.quad(
        [x + Math.cos(a0) * 0.12, 0.67 + Math.sin(a0) * 0.12, tz - 0.02],
        [x + Math.cos(a1) * 0.12, 0.67 + Math.sin(a1) * 0.12, tz - 0.02],
        [x + Math.cos(a1) * 0.12, 0.67 + Math.sin(a1) * 0.12, tz - 0.03],
        [x + Math.cos(a0) * 0.12, 0.67 + Math.sin(a0) * 0.12, tz - 0.03],
        i === 2 ? FABRIC_DK : CABLE, M_RUBBER,
      )
    }
  }

  // Preparation workstation, further along the same bulkhead.
  b.box(-5.1, 0.72, -18.4, -3.5, 0.78, -17.95, ALLOY, [0.42, 0.7, 1])
  b.box(-5.0, 0.0, -18.3, -4.9, 0.72, -18.05, ALLOY, M_METAL)
  b.box(-3.7, 0.0, -18.3, -3.6, 0.72, -18.05, ALLOY, M_METAL)
  b.quad([-5.0, 0.95, -17.92], [-5.0, 1.52, -17.92], [-3.6, 1.52, -17.92], [-3.6, 0.95, -17.92], DARKMETAL, [0.36, 0.5, 1])
}

// ========================================================= hatches / doors
/**
 * The hatch leaf, built at the origin so the renderer can swing it.
 *
 * Returned as its own mesh range rather than welded into the shell: a hatch is
 * the one part of the interior that moves, and its collision is driven by the
 * same state that drives this transform, so the leaf you see and the barrier
 * you walk into are always the same thing.
 */
export function hatchLeaf(b: Builder, width: number, height: number): void {
  const hw = width / 2
  const t = 0.09
  // Leaf, both faces and the rim.
  b.quad([0, 0, -t], [0, height, -t], [width, height, -t], [width, 0, -t], PANEL, M_PANEL)
  b.quad([0, 0, t], [width, 0, t], [width, height, t], [0, height, t], PANEL_2, M_PANEL)
  for (const [a, c2] of [[0, width], [width, 0]] as const) {
    b.quad([a, 0, -t], [a, height, -t], [a, height, t], [a, 0, t], ALLOY, M_METAL)
    void c2
  }
  b.quad([0, height, -t], [0, height, t], [width, height, t], [width, height, -t], ALLOY, M_METAL)
  b.quad([0, 0, t], [0, 0, -t], [width, 0, -t], [width, 0, t], ALLOY, M_METAL)

  // Pressure seal around the mating face, in rubber.
  const s = 0.055
  for (const [u0, v0, u1, v1] of [
    [s, s, width - s, s + 0.03], [s, height - s - 0.03, width - s, height - s],
    [s, s, s + 0.03, height - s], [width - s - 0.03, s, width - s, height - s],
  ]) {
    b.box(u0, v0, -t - 0.022, u1, v1, -t, DARKMETAL, M_RUBBER)
  }

  // Central locking wheel with six spokes, and the latch cams it drives.
  const cx = hw
  const cy = height * 0.5
  b.box(cx - 0.055, cy - 0.055, t, cx + 0.055, cy + 0.055, t + 0.07, ALLOY, M_METAL)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    b.box(cx + dx * 0.05 - 0.022, cy + dy * 0.05 - 0.022, t + 0.03, cx + dx * 0.21 + 0.022, cy + dy * 0.21 + 0.022, t + 0.062, ALLOY, M_METAL)
    // Latch cam on the rim, driven by the wheel.
    b.box(cx + dx * (hw - 0.07) - 0.03, cy + dy * (height / 2 - 0.07) - 0.03, t, cx + dx * (hw - 0.07) + 0.03, cy + dy * (height / 2 - 0.07) + 0.03, t + 0.035, ALLOY, M_METAL)
  }
  // Grab handle, a viewport, and a placard.
  b.box(cx - 0.3, cy - 0.42, t, cx - 0.24, cy - 0.16, t + 0.06, RAIL, M_RAIL)
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2
    const a1 = ((k + 1) / 12) * Math.PI * 2
    b.tri(
      [cx, cy + height * 0.3, t + 0.004],
      [cx + Math.cos(a0) * 0.12, cy + height * 0.3 + Math.sin(a0) * 0.12, t + 0.004],
      [cx + Math.cos(a1) * 0.12, cy + height * 0.3 + Math.sin(a1) * 0.12, t + 0.004],
      GLASS, M_GLASS,
    )
  }
  b.quad([cx - 0.2, cy - 0.56, t + 0.004], [cx - 0.2, cy - 0.48, t + 0.004], [cx + 0.2, cy - 0.48, t + 0.004], [cx + 0.2, cy - 0.56, t + 0.004], LABEL, M_SOFT)
}

/** The frame, collar and fittings around a hatch opening, which do not move. */
export function hatchSurround(b: Builder, doorId: string, height: number): void {
  const d = DOORS.find((x) => x.id === doorId)
  if (!d) return
  const w = d.hi - d.lo
  const y1 = height
  const th = 0.3
  // The wall is at constant x for both hatches here.
  const P = (across: number, y: number, depth: number): P3 => [d.at + depth, y, across]

  // Collar, in the structural peach of every pressure fitting in the vessel.
  for (const [a0, b0, a1, b1] of [
    [d.lo - 0.3, 0, d.lo, y1 + 0.3], [d.hi, 0, d.hi + 0.3, y1 + 0.3],
    [d.lo, y1, d.hi, y1 + 0.3],
  ] as const) {
    for (const depth of [-th, th]) {
      b.quad(P(a0, b0, depth), P(a0, b1, depth), P(a1, b1, depth), P(a1, b0, depth), PEACH, M_PANEL)
    }
  }
  // Throat.
  for (const across of [d.lo, d.hi]) {
    b.quad(P(across, 0, -th), P(across, y1, -th), P(across, y1, th), P(across, 0, th), PEACH_DK, M_PANEL)
  }
  b.quad(P(d.lo, y1, -th), P(d.lo, y1, th), P(d.hi, y1, th), P(d.hi, y1, -th), PEACH_DK, M_PANEL)
  // Sill, with a kick plate.
  b.box(d.at - th, 0, d.lo, d.at + th, 0.06, d.hi, ALLOY, M_METAL)

  // Hinge knuckles on the swing side.
  const hingeAt = d.swing > 0 ? d.hi : d.lo
  for (const y of [0.3, y1 * 0.5, y1 - 0.3]) {
    b.box(d.at - 0.06, y - 0.09, hingeAt - 0.07, d.at + 0.06, y + 0.09, hingeAt + 0.07, ALLOY, M_METAL)
  }
  // Pressure equalisation valve and gauge beside the opening.
  const gx = d.lo - 0.52
  b.box(d.at - 0.1, 1.3, gx - 0.16, d.at + 0.1, 1.62, gx + 0.16, PANEL_2, M_PANEL)
  b.box(d.at - 0.14, 1.38, gx - 0.07, d.at + 0.14, 1.52, gx + 0.07, ALLOY, M_METAL)
  b.box(d.at - 0.02, 1.68, gx - 0.12, d.at + 0.02, 1.86, gx + 0.12, LABEL, M_SOFT)
  void w
}

// ==================================================== chamber outfitting
/** Inside the crew lock: pressure instrumentation, valves and lighting. */
export function airlockChamber(b: Builder): void {
  const r = ROOMS.find((x) => x.id === 'chamber')
  if (!r) return
  const zc = (r.z0 + r.z1) / 2

  // Control panel on the forward wall: gauge, valve handles, status lamps.
  b.quad([r.x0 + 0.12, 0.9, r.z1 - 0.1], [r.x0 + 0.12, 1.9, r.z1 - 0.1], [r.x1 - 0.12, 1.9, r.z1 - 0.1], [r.x1 - 0.12, 0.9, r.z1 - 0.1], PANEL_2, M_PANEL)
  // Pressure gauge: a bezel with a dial face.
  for (let k = 0; k < 14; k++) {
    const a0 = (k / 14) * Math.PI * 2
    const a1 = ((k + 1) / 14) * Math.PI * 2
    const cx = r.x0 + 0.62
    b.quad(
      [cx + Math.cos(a0) * 0.13, 1.52 + Math.sin(a0) * 0.13, r.z1 - 0.12],
      [cx + Math.cos(a0) * 0.17, 1.52 + Math.sin(a0) * 0.17, r.z1 - 0.12],
      [cx + Math.cos(a1) * 0.17, 1.52 + Math.sin(a1) * 0.17, r.z1 - 0.12],
      [cx + Math.cos(a1) * 0.13, 1.52 + Math.sin(a1) * 0.13, r.z1 - 0.12],
      ALLOY, M_METAL,
    )
    b.tri([cx, 1.52, r.z1 - 0.125],
      [cx + Math.cos(a0) * 0.13, 1.52 + Math.sin(a0) * 0.13, r.z1 - 0.125],
      [cx + Math.cos(a1) * 0.13, 1.52 + Math.sin(a1) * 0.13, r.z1 - 0.125], LABEL, M_SOFT)
  }
  // Valve handles.
  for (let i = 0; i < 3; i++) {
    const cx = r.x0 + 1.35 + i * 0.45
    b.box(cx - 0.05, 1.42, r.z1 - 0.2, cx + 0.05, 1.62, r.z1 - 0.12, ALLOY, M_METAL)
    b.box(cx - 0.13, 1.56, r.z1 - 0.24, cx + 0.13, 1.64, r.z1 - 0.16, RAIL, M_RAIL)
    b.quad([cx - 0.12, 1.3, r.z1 - 0.11], [cx - 0.12, 1.37, r.z1 - 0.11], [cx + 0.12, 1.37, r.z1 - 0.11], [cx + 0.12, 1.3, r.z1 - 0.11], LABEL, M_SOFT)
  }
  // Status lamp column.
  for (let i = 0; i < 4; i++) {
    const col: Rgb = i === 0 ? GREEN_L : i === 3 ? [0.4, 0.09, 0.06] : AMBER_L
    b.box(r.x1 - 0.32, 1.1 + i * 0.16, r.z1 - 0.18, r.x1 - 0.2, 1.22 + i * 0.16, r.z1 - 0.11, col, M_SOFT)
  }
  // Suit umbilical station: where a suit is on station power before egress.
  b.box(r.x0 + 0.1, 0.4, r.z0 + 0.14, r.x0 + 0.42, 0.95, r.z0 + 0.74, PANEL, M_PANEL)
  for (const [u, col] of [[0.22, CABLE], [0.3, RAIL]] as const) {
    b.box(r.x0 + 0.42, 0.6 + u * 0.4, r.z0 + 0.26, r.x0 + 0.78, 0.66 + u * 0.4, r.z0 + 0.32, col as Rgb, M_RUBBER)
  }
  // Foot restraints on the deck and handrails on both long walls.
  b.box(r.x0 + 1.1, 0.02, zc - 0.3, r.x0 + 1.9, 0.08, zc + 0.3, GRATE, M_SOFT)
  for (const z of [r.z0 + 0.22, r.z1 - 0.22]) {
    b.box(r.x0 + 0.3, 1.24, z - 0.035, r.x1 - 0.3, 1.3, z + 0.035, RAIL, M_RAIL)
  }
  // Caution placards around the outer hatch.
  b.quad([r.x0 + 0.02, 1.95, zc - 0.5], [r.x0 + 0.02, 2.08, zc - 0.5], [r.x0 + 0.02, 2.08, zc + 0.5], [r.x0 + 0.02, 1.95, zc + 0.5], AMBER_L, M_SOFT)
}

// ====================================================== crew environment
/**
 * The galley.
 *
 * A food warmer, a water dispenser, a wardroom surface with foot and thigh
 * restraints, and stowage of food packages. Every item is restrained: pouches
 * are behind a retaining net, containers are in a drawer, and the loose things
 * on the table are under a strap. A galley with food floating about would be
 * wrong in the particular way that is worse than leaving it out.
 */
export function galley(b: Builder): void {
  const r = ROOMS.find((x) => x.id === 'crew')
  if (!r) return
  // The aft bulkhead. The starboard side of this module is open to the spine
  // for its whole length and the port side carries the sleep stations, so this
  // is the wall a galley can actually be mounted on.
  const wz = r.z0 + 0.1

  /** Wall-local to world: u along the module, d out from the bulkhead. */
  const G = (u: number, y: number, d: number): P3 => [r.x0 + 1.1 + u, y, wz + d]
  const gbox = (u0: number, y0: number, d0: number, u1: number, y1: number, d1: number, col: Rgb, mat: Mat) =>
    b.box(...boxPts(G(u0, y0, d0), G(u1, y1, d1)), col, mat)

  // Food warmer: a case with a hinged lid and a control strip.
  gbox(0.0, 1.1, 0.0, 0.86, 1.52, 0.54, PANEL, M_PANEL)
  gbox(0.04, 1.52, 0.02, 0.82, 1.57, 0.5, ALLOY, M_METAL)
  b.quad(G(0.1, 1.18, 0.56), G(0.1, 1.3, 0.56), G(0.76, 1.3, 0.56), G(0.76, 1.18, 0.56), DARKMETAL, [0.32, 0.3, 1])
  for (let i = 0; i < 4; i++) {
    gbox(0.14 + i * 0.17, 1.36, 0.55, 0.26 + i * 0.17, 1.44, 0.6, i === 0 ? GREEN_L : ALLOY, M_METAL)
  }

  // Potable water dispenser, with its needle and a pouch on the port.
  gbox(1.05, 1.62, 0.0, 1.65, 2.16, 0.44, PANEL_2, M_PANEL)
  gbox(1.22, 1.72, 0.44, 1.3, 1.82, 0.62, ALLOY, M_METAL)
  gbox(1.2, 1.7, 0.62, 1.34, 1.84, 0.69, GRATE, M_RUBBER)
  b.quad(G(1.12, 1.92, 0.46), G(1.12, 2.06, 0.46), G(1.58, 2.06, 0.46), G(1.58, 1.92, 0.46), LABEL, M_SOFT)

  // Wardroom surface with restraints, and a strap across it.
  gbox(0.1, 0.74, 0.05, 1.5, 0.79, 0.9, ALLOY, [0.44, 0.65, 1])
  for (const u of [0.3, 1.3]) gbox(u - 0.04, 0.0, 0.72, u + 0.04, 0.74, 0.8, ALLOY, M_METAL)
  gbox(0.6, 0.79, 0.07, 0.66, 0.81, 0.88, CABLE, M_RUBBER)
  // Two drink pouches and a meal container under the strap.
  gbox(0.42, 0.79, 0.62, 0.58, 0.94, 0.74, FOODBAG_2, M_SOFT)
  gbox(0.44, 0.79, 0.44, 0.58, 0.93, 0.56, FOODBAG, M_SOFT)
  gbox(0.4, 0.79, 0.2, 0.62, 0.87, 0.4, PANEL_2, M_PANEL)
  // Foot restraints beneath, where a crew member anchors to eat.
  gbox(0.52, 0.02, 0.3, 1.02, 0.07, 0.86, GRATE, M_SOFT)

  // Food stowage: an open locker with pouches behind a retaining net.
  const su = 2.1
  gbox(su, 0.9, 0.0, su + 1.5, 2.1, 0.66, PANEL_2, M_PANEL)
  for (let row = 0; row < 3; row++) {
    const y = 1.0 + row * 0.38
    gbox(su + 0.04, y - 0.03, 0.02, su + 1.46, y, 0.64, ALLOY, M_METAL)
    for (let i = 0; i < 6; i++) {
      const k = rnd(row * 7.3 + i * 2.9)
      const u = su + 0.1 + i * 0.22
      gbox(u, y, 0.18, u + 0.18, y + 0.3, 0.6, k > 0.55 ? FOODBAG : k > 0.25 ? FOODBAG_2 : BAG, M_SOFT)
    }
    // The net: thin cords across the opening.
    for (const dy of [0.08, 0.2]) {
      gbox(su + 0.04, y + dy, 0.64, su + 1.46, y + dy + 0.015, 0.67, CABLE, M_RUBBER)
    }
  }
  // Labels down the locker front.
  for (let row = 0; row < 3; row++) {
    b.quad(G(su + 0.1, 1.3 + row * 0.38, 0.68), G(su + 0.1, 1.38 + row * 0.38, 0.68),
           G(su + 0.44, 1.38 + row * 0.38, 0.68), G(su + 0.44, 1.3 + row * 0.38, 0.68), LABEL, M_SOFT)
  }
}

/**
 * Exercise hardware: a resistive device with its cylinders and bar, and a
 * cycle ergometer with no saddle, because in free fall nobody sits on one.
 */
export function exerciseStation(b: Builder): void {
  const r = ROOMS.find((x) => x.id === 'environment')
  if (!r) return
  const x = r.x1 - 1.1
  const z = r.z0 + 1.2

  // Resistive device: frame, two vacuum cylinders, cable runs and the bar.
  b.box(x - 0.5, 0.05, z - 0.42, x + 0.5, 0.18, z + 0.42, GRATE, M_METAL)
  for (const u of [-0.42, 0.42]) {
    b.box(x + u - 0.06, 0.18, z - 0.3, x + u + 0.06, 1.95, z + 0.3, ALLOY, M_METAL)
    // Cylinder.
    b.box(x + u - 0.13, 0.3, z - 0.15, x + u + 0.13, 1.0, z + 0.15, PANEL_2, M_PANEL)
    // Cable from the cylinder up to the pulley and down to the bar.
    b.box(x + u - 0.018, 1.0, z - 0.018, x + u + 0.018, 1.86, z + 0.018, CABLE, M_RUBBER)
    b.box(x + u - 0.08, 1.86, z - 0.07, x + u + 0.08, 1.98, z + 0.07, ALLOY, M_METAL)
  }
  // The bar itself, stowed across the uprights, with knurled grips.
  b.box(x - 0.56, 1.42, z - 0.035, x + 0.56, 1.48, z + 0.035, ALLOY, M_METAL)
  for (const u of [-0.4, 0.4]) {
    b.box(x + u - 0.12, 1.405, z - 0.05, x + u + 0.12, 1.495, z + 0.05, GRATE, M_RUBBER)
  }
  // Control display and a strap bundle on the frame.
  b.quad([x - 0.2, 1.62, z + 0.31], [x - 0.2, 1.86, z + 0.31], [x + 0.2, 1.86, z + 0.31], [x + 0.2, 1.62, z + 0.31], DARKMETAL, [0.3, 0.3, 1])
  b.box(x + 0.3, 0.5, z + 0.3, x + 0.46, 0.78, z + 0.42, BAG_2, M_SOFT)

  // Cycle ergometer on the opposite wall: no saddle, pedals and shoe clips,
  // and the hip restraint a crew member actually straps into.
  const ex = r.x1 - 1.1
  const ez = r.z1 - 1.3
  b.box(ex - 0.42, 0.05, ez - 0.3, ex + 0.42, 0.14, ez + 0.3, GRATE, M_METAL)
  b.box(ex - 0.28, 0.14, ez - 0.22, ex + 0.28, 0.62, ez + 0.22, PANEL, M_PANEL)
  for (const side of [-1, 1] as const) {
    b.box(ex - 0.05, 0.38, ez + side * 0.26, ex + 0.05, 0.44, ez + side * 0.42, ALLOY, M_METAL)
    b.box(ex - 0.12, 0.3, ez + side * 0.36, ex + 0.12, 0.38, ez + side * 0.5, DARKMETAL, [0.7, 0, 1])
  }
  b.box(ex - 0.34, 0.62, ez - 0.1, ex - 0.22, 1.28, ez + 0.1, ALLOY, M_METAL)
  b.quad([ex - 0.34, 1.28, ez - 0.2], [ex - 0.34, 1.52, ez - 0.2], [ex - 0.34, 1.52, ez + 0.2], [ex - 0.34, 1.28, ez + 0.2], DARKMETAL, [0.3, 0.3, 1])
  b.box(ex + 0.2, 0.62, ez - 0.24, ex + 0.34, 0.74, ez + 0.24, BAG_2, M_SOFT)
}

/**
 * A crew seat.
 *
 * In free fall a seat is a restraint rather than a chair, so this is a frame,
 * a back pad, lap and shoulder straps and a foot bar — not something you sit
 * down into. They are set at the command workstations, where a crew member
 * wants to stay put while working a console.
 */
export function crewSeat(b: Builder, x: number, z: number, facing: number): void {
  const c = Math.cos(facing)
  const s = Math.sin(facing)
  const P = (lx: number, ly: number, lz: number): P3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c]

  // Backrest pad on a frame, and the frame's legs down to the deck.
  b.box(...boxPts(P(-0.3, 0.52, -0.1), P(0.3, 1.24, -0.02)), SEAT, M_SOFT)
  b.box(...boxPts(P(-0.33, 0.48, -0.14), P(0.33, 1.3, -0.1)), ALLOY, M_METAL)
  for (const u of [-0.28, 0.28]) {
    b.box(...boxPts(P(u - 0.03, 0.0, -0.13), P(u + 0.03, 0.52, -0.07)), ALLOY, M_METAL)
    b.box(...boxPts(P(u - 0.03, 0.0, -0.13), P(u + 0.03, 0.06, 0.26)), ALLOY, M_METAL)
  }
  // Seat pan, shallow: it is there to brace against, not to sit on.
  b.box(...boxPts(P(-0.28, 0.44, -0.08), P(0.28, 0.52, 0.22)), SEAT, M_SOFT)
  // Lap strap across, and shoulder straps over the back.
  b.box(...boxPts(P(-0.32, 0.5, 0.2), P(0.32, 0.54, 0.25)), BAG_2, M_SOFT)
  for (const u of [-0.16, 0.16]) {
    b.box(...boxPts(P(u - 0.035, 0.6, -0.03), P(u + 0.035, 1.2, 0.01)), BAG_2, M_SOFT)
    b.box(...boxPts(P(u - 0.025, 0.56, -0.03), P(u + 0.025, 0.62, 0.03)), ALLOY, M_METAL)
  }
  // Foot bar a crew member hooks into.
  b.box(...boxPts(P(-0.26, 0.06, 0.2), P(0.26, 0.12, 0.28)), RAIL, M_RAIL)
}

/**
 * A secondary workstation: a screen, keyboard and the hardware behind it.
 *
 * Distinct from the six consoles in `deck.ts`, which are interactive and open
 * AURORA panels. These are the rest of the computers a station carries — the
 * ones a crew member passes without using. They are built with the same parts
 * so the two read as the same equipment, and they carry a label naming what
 * each one is for.
 */
export function auxWorkstation(b: Builder, x: number, y: number, z: number, facing: number, lit: boolean): void {
  const c = Math.cos(facing)
  const s = Math.sin(facing)
  const P = (lx: number, ly: number, lz: number): P3 => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c]

  // Mounting plate and the arm the screen sits on.
  b.box(...boxPts(P(-0.26, -0.3, -0.06), P(0.26, 0.34, 0.0)), PANEL_2, M_PANEL)
  b.box(...boxPts(P(-0.035, 0.0, 0.0), P(0.035, 0.07, 0.14)), ALLOY, M_METAL)
  // Bezel and screen.
  b.box(...boxPts(P(-0.25, -0.16, 0.14), P(0.25, 0.2, 0.18)), DARKMETAL, [0.36, 0.5, 1])
  b.quad(P(-0.225, -0.135, 0.182), P(-0.225, 0.175, 0.182), P(0.225, 0.175, 0.182), P(0.225, -0.135, 0.182),
    lit ? [0.10, 0.24, 0.33] : [0.03, 0.035, 0.045], [0.22, 0, 1])
  // Keyboard on a fold-down tray, and a cable to the plate.
  b.box(...boxPts(P(-0.2, -0.26, 0.1), P(0.2, -0.23, 0.26)), PANEL, M_PANEL)
  for (let r2 = 0; r2 < 4; r2++) {
    for (let k = 0; k < 11; k++) {
      b.box(...boxPts(
        P(-0.185 + k * 0.034, -0.228, 0.12 + r2 * 0.035),
        P(-0.163 + k * 0.034, -0.221, 0.142 + r2 * 0.035)), GRATE, M_SOFT)
    }
  }
  b.box(...boxPts(P(0.1, -0.3, 0.02), P(0.13, -0.16, 0.05)), CABLE, M_RUBBER)
  // Label plate above.
  b.quad(P(-0.16, 0.24, 0.02), P(-0.16, 0.31, 0.02), P(0.16, 0.31, 0.02), P(0.16, 0.24, 0.02), LABEL, M_SOFT)
}

/**
 * The flight operations area.
 *
 * The command module gets the seats, the extra screens and the overhead panel
 * that make it read as somewhere the vessel is actually flown from, rather
 * than as a corridor with a window at the end.
 */
export function commandArea(b: Builder): void {
  const r = ROOMS.find((x) => x.id === 'command')
  if (!r) return

  // Two operator stations either side of the cupola approach, facing forward.
  for (const side of [-1, 1] as const) {
    const x = side * 3.9
    const z = r.z0 + 2.4
    crewSeat(b, x, z - 0.75, Math.PI)
    // Console surface in front of each seat.
    b.box(x - 0.78, 0.72, z, x + 0.78, 0.78, z + 0.5, ALLOY, [0.42, 0.7, 1])
    for (const u of [-0.68, 0.68]) b.box(x + u - 0.04, 0.0, z + 0.12, x + u + 0.04, 0.72, z + 0.2, ALLOY, M_METAL)
    // Three screens on each: flight, systems, exterior camera.
    for (let i = 0; i < 3; i++) {
      auxWorkstation(b, x - 0.52 + i * 0.52, 1.18, z + 0.46, Math.PI, true)
    }
    // Switch and breaker panel under the surface.
    b.quad([x - 0.7, 0.34, z + 0.02], [x - 0.7, 0.7, z + 0.02], [x + 0.7, 0.7, z + 0.02], [x + 0.7, 0.34, z + 0.02], PANEL_2, M_PANEL)
    for (let i = 0; i < 10; i++) {
      const u = x - 0.62 + i * 0.138
      b.box(u - 0.028, 0.46, z + 0.0, u + 0.028, 0.56, z + 0.03, ALLOY, M_METAL)
      b.box(u - 0.018, 0.4, z + 0.0, u + 0.018, 0.44, z + 0.02, rnd(i * 3.7) > 0.7 ? AMBER_L : GREEN_L, M_SOFT)
    }
  }

  // Overhead panel across the module: circuit breakers, caution and warning.
  const oy = r.height - 0.42
  b.box(-2.6, oy - 0.16, r.z0 + 1.4, 2.6, oy, r.z0 + 2.3, PANEL_2, M_PANEL)
  for (let i = 0; i < 18; i++) {
    const u = -2.4 + i * 0.28
    b.box(u - 0.05, oy - 0.2, r.z0 + 1.52, u + 0.05, oy - 0.16, r.z0 + 1.72, ALLOY, M_METAL)
    b.box(u - 0.035, oy - 0.19, r.z0 + 1.82, u + 0.035, oy - 0.16, r.z0 + 1.96, rnd(i * 5.1) > 0.78 ? AMBER_L : GRATE, M_SOFT)
  }
  b.quad([-1.1, oy - 0.162, r.z0 + 2.04], [-1.1, oy - 0.162, r.z0 + 2.22], [1.1, oy - 0.162, r.z0 + 2.22], [1.1, oy - 0.162, r.z0 + 2.04], LABEL, M_SOFT)

  // Handholds either side of the cupola approach, which is how you get there.
  for (const side of [-1, 1] as const) {
    b.box(side * 2.5 - 0.04, 1.1, r.z1 - 1.6, side * 2.5 + 0.04, 2.3, r.z1 - 1.52, RAIL, M_RAIL)
  }
}

/**
 * Additional computers through the rest of the vessel, each labelled with a
 * different function so no two read as the same screen duplicated.
 */
export function auxComputers(b: Builder): void {
  const spots: [number, number, number, number][] = [
    // medical bay: a second diagnostics screen and an inventory terminal
    [5.0, 1.42, 11.28, 0],
    [3.6, 1.42, 11.28, 0],
    // crew quarters: exercise monitoring beside the galley
    [-5.0, 1.42, 11.28, 0],
    // environmental control: water processing and atmosphere
    [5.0, 1.42, -12.28, Math.PI],
    [3.6, 1.42, -12.28, Math.PI],
    // communications: a second traffic terminal
    [-5.0, 1.42, -12.28, Math.PI],
    // research: sample and experiment terminals
    [5.4, 1.42, -25.48, Math.PI],
    [7.0, 1.42, -25.48, Math.PI],
    // EVA preparation: suit monitoring and airlock status, on the forward
    // bulkhead beside the prep workstation (the aft wall carries the helmet
    // shelf, and a screen there would have been inside it).
    [-4.3, 1.42, -17.92, 0],
    [-3.0, 1.42, -17.92, 0],
  ]
  for (const [x, y, z, f] of spots) auxWorkstation(b, x, y, z, f, true)
}

// ===================================================== medical operations
/**
 * The medical bay's physical equipment.
 *
 * Each item here is something a procedure in `model/procedures.ts` refers to,
 * so the bay contains the instruments the console claims to use rather than a
 * generic set of boxes: a cuff on its arm board, an ECG unit with its lead
 * set, an ultrasound on a swing arm, a medication locker with a visible seal,
 * two portable kits at their stowage points, and a sample cold stowage unit.
 */
export function medicalBay(b: Builder): void {
  const r = ROOMS.find((x) => x.id === 'medical')
  if (!r) return
  const wz = r.z1 - 0.1
  /** Wall-local: u along the module from its outboard wall, d out from the wall. */
  const M = (u: number, y: number, d: number): P3 => [r.x1 - 0.6 - u, y, wz - d]
  const mbox = (u0: number, y0: number, d0: number, u1: number, y1: number, d1: number, c: Rgb, m: Mat) =>
    b.box(...boxPts(M(u0, y0, d0), M(u1, y1, d1)), c, m)

  // ---- examination surface with restraints, where a crew member is worked on
  mbox(0.0, 0.72, 0.1, 1.9, 0.78, 0.86, ALLOY, [0.44, 0.65, 1])
  for (const u of [0.25, 1.65]) mbox(u - 0.04, 0.0, 0.7, u + 0.04, 0.72, 0.78, ALLOY, M_METAL)
  // Padded section and two body restraint straps.
  mbox(0.35, 0.78, 0.16, 1.55, 0.83, 0.8, SEAT, M_SOFT)
  for (const u of [0.6, 1.3]) mbox(u, 0.83, 0.14, u + 0.07, 0.86, 0.82, BAG_2, M_SOFT)
  // Foot restraints for whoever is doing the examining.
  mbox(0.5, 0.02, 0.95, 1.4, 0.07, 1.45, GRATE, M_SOFT)

  // ---- blood pressure unit: monitor, cuff on an arm board, tubing
  mbox(0.05, 0.9, 0.0, 0.5, 1.26, 0.36, PANEL, M_PANEL)
  b.quad(M(0.12, 1.0, 0.37), M(0.12, 1.18, 0.37), M(0.43, 1.18, 0.37), M(0.43, 1.0, 0.37), DARKMETAL, [0.3, 0.3, 1])
  mbox(0.1, 0.84, 0.4, 0.46, 0.88, 0.76, ALLOY, M_METAL)
  mbox(0.16, 0.88, 0.46, 0.4, 0.96, 0.7, FABRIC_DK, M_SOFT)
  mbox(0.26, 0.9, 0.36, 0.3, 0.94, 0.46, CABLE, M_RUBBER)

  // ---- ECG unit with its lead set hung beside it
  mbox(0.6, 0.9, 0.0, 1.1, 1.3, 0.34, PANEL_2, M_PANEL)
  b.quad(M(0.66, 1.02, 0.35), M(0.66, 1.24, 0.35), M(1.04, 1.24, 0.35), M(1.04, 1.02, 0.35), DARKMETAL, [0.3, 0.3, 1])
  for (let i = 0; i < 5; i++) mbox(0.66 + i * 0.08, 0.93, 0.33, 0.71 + i * 0.08, 0.98, 0.37, i === 0 ? GREEN_L : ALLOY, M_METAL)
  // Four leads, coiled on a hook.
  mbox(1.14, 1.16, 0.06, 1.18, 1.22, 0.14, ALLOY, M_METAL)
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2
      const a1 = ((k + 1) / 8) * Math.PI * 2
      const rr = 0.05 + i * 0.012
      b.quad(
        M(1.16 + Math.cos(a0) * rr, 1.05 + Math.sin(a0) * rr, 0.1),
        M(1.16 + Math.cos(a1) * rr, 1.05 + Math.sin(a1) * rr, 0.1),
        M(1.16 + Math.cos(a1) * rr, 1.05 + Math.sin(a1) * rr, 0.112),
        M(1.16 + Math.cos(a0) * rr, 1.05 + Math.sin(a0) * rr, 0.112),
        i % 2 ? CABLE : GRATE, M_RUBBER,
      )
    }
  }

  // ---- ultrasound on a swing arm, with its probe in a holster
  mbox(1.35, 1.3, 0.0, 1.45, 1.9, 0.1, ALLOY, M_METAL)
  mbox(1.45, 1.74, 0.04, 2.0, 1.82, 0.12, ALLOY, M_METAL)
  mbox(1.86, 1.4, 0.02, 2.22, 1.76, 0.3, PANEL, M_PANEL)
  b.quad(M(1.92, 1.46, 0.31), M(1.92, 1.7, 0.31), M(2.16, 1.7, 0.31), M(2.16, 1.46, 0.31), DARKMETAL, [0.28, 0.3, 1])
  mbox(2.26, 1.46, 0.06, 2.34, 1.66, 0.16, GRATE, M_SOFT)
  mbox(2.28, 1.5, 0.16, 2.32, 1.64, 0.22, DARKMETAL, M_RUBBER)

  // ---- medication locker: a sealed cabinet with a labelled door and a seal
  mbox(2.5, 0.95, 0.0, 3.4, 1.95, 0.5, PANEL_2, M_PANEL)
  b.quad(M(2.56, 1.02, 0.51), M(2.56, 1.88, 0.51), M(3.34, 1.88, 0.51), M(3.34, 1.02, 0.51), PANEL, M_PANEL)
  mbox(3.22, 1.38, 0.51, 3.3, 1.52, 0.57, ALLOY, M_METAL)
  // Tamper seal across the opening edge, and the placard.
  mbox(2.54, 1.42, 0.5, 2.6, 1.48, 0.54, AMBER_L, M_SOFT)
  b.quad(M(2.66, 1.7, 0.52), M(2.66, 1.82, 0.52), M(3.14, 1.82, 0.52), M(3.14, 1.7, 0.52), LABEL, M_SOFT)

  // ---- two portable medical kits at their stowage points
  for (const [u, d] of [[3.6, 0.0], [4.2, 0.0]] as const) {
    mbox(u, 1.0, d, u + 0.5, 1.4, d + 0.4, BAG, M_SOFT)
    mbox(u + 0.04, 1.37, d + 0.04, u + 0.46, 1.42, d + 0.36, ALLOY, M_METAL)
    b.quad(M(u + 0.1, 1.08, d + 0.41), M(u + 0.1, 1.2, d + 0.41), M(u + 0.4, 1.2, d + 0.41), M(u + 0.4, 1.08, d + 0.41), LABEL, M_SOFT)
    // Retaining strap, because a kit that floats off is no kit at all.
    mbox(u + 0.2, 0.98, d - 0.02, u + 0.28, 1.44, d + 0.42, BAG_2, M_SOFT)
  }

  // ---- sample cold stowage, with its own compressor and a readout
  mbox(3.6, 0.1, 0.0, 4.6, 0.92, 0.6, PANEL_2, M_PANEL)
  mbox(3.66, 0.16, 0.6, 4.54, 0.86, 0.66, PANEL, M_PANEL)
  mbox(4.3, 0.44, 0.66, 4.44, 0.58, 0.72, ALLOY, M_METAL)
  b.quad(M(3.78, 0.62, 0.67), M(3.78, 0.76, 0.67), M(4.12, 0.76, 0.67), M(4.12, 0.62, 0.67), DARKMETAL, [0.3, 0.3, 1])
  mbox(3.7, 0.0, 0.1, 4.5, 0.12, 0.5, GRATE, M_METAL)

  // ---- sharps and waste container, clearly marked, under the surface
  mbox(1.1, 0.1, 0.95, 1.4, 0.5, 1.3, PANEL, M_PANEL)
  mbox(1.1, 0.5, 0.95, 1.4, 0.54, 1.3, AMBER_L, M_SOFT)

  // ---- glove and mask dispensers on the wall above the surface
  for (let i = 0; i < 2; i++) {
    mbox(0.1 + i * 0.5, 1.9, 0.0, 0.52 + i * 0.5, 2.18, 0.2, PANEL, M_PANEL)
    mbox(0.16 + i * 0.5, 1.94, 0.2, 0.46 + i * 0.5, 2.06, 0.24, i ? BAG_2 : [0.26, 0.3, 0.34], M_SOFT)
  }
}

/**
 * Environmental control: the water processing rack with the filter housing
 * that one of the procedures replaces, plus the atmosphere hardware.
 */
export function environmentRack(b: Builder): void {
  const r = ROOMS.find((x) => x.id === 'environment')
  if (!r) return
  const wz = r.z1 - 0.1
  const E = (u: number, y: number, d: number): P3 => [r.x0 + 0.6 + u, y, wz - d]
  const ebox = (u0: number, y0: number, d0: number, u1: number, y1: number, d1: number, c: Rgb, m: Mat) =>
    b.box(...boxPts(E(u0, y0, d0), E(u1, y1, d1)), c, m)

  // ---- water processing rack: tanks, pump, filter housing, pipework
  ebox(0, 0.1, 0.0, 1.5, 2.1, 0.55, PANEL_2, M_PANEL)
  // Two tanks, upright, with level sight glasses.
  for (const u of [0.18, 0.72]) {
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2
      const a1 = ((k + 1) / 10) * Math.PI * 2
      const rr = 0.2
      b.quad(
        E(u + 0.22 + Math.cos(a0) * rr, 0.3, 0.55 + Math.sin(a0) * rr * 0.45),
        E(u + 0.22 + Math.cos(a0) * rr, 1.25, 0.55 + Math.sin(a0) * rr * 0.45),
        E(u + 0.22 + Math.cos(a1) * rr, 1.25, 0.55 + Math.sin(a1) * rr * 0.45),
        E(u + 0.22 + Math.cos(a1) * rr, 0.3, 0.55 + Math.sin(a1) * rr * 0.45),
        ALLOY, M_METAL,
      )
    }
    ebox(u + 0.2, 0.35, 0.72, u + 0.24, 1.2, 0.76, GLASS, M_GLASS)
  }
  // The filter housing — the part a procedure takes off and replaces.
  ebox(0.26, 1.42, 0.55, 0.74, 1.92, 0.95, ALLOY, M_METAL)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    ebox(0.5 + Math.cos(a) * 0.2 - 0.03, 1.67 + Math.sin(a) * 0.2 - 0.03, 0.95,
         0.5 + Math.cos(a) * 0.2 + 0.03, 1.67 + Math.sin(a) * 0.2 + 0.03, 1.0, ALLOY, M_METAL)
  }
  ebox(0.42, 1.59, 1.0, 0.58, 1.75, 1.04, DARKMETAL, M_RUBBER)
  b.quad(E(0.3, 1.96, 0.6), E(0.3, 2.06, 0.6), E(0.7, 2.06, 0.6), E(0.7, 1.96, 0.6), LABEL, M_SOFT)
  // Isolation valves either side of the housing, which the procedure shuts.
  for (const u of [0.18, 0.84]) {
    ebox(u - 0.05, 1.3, 0.62, u + 0.05, 1.42, 0.72, ALLOY, M_METAL)
    ebox(u - 0.11, 1.38, 0.66, u + 0.11, 1.44, 0.76, RAIL, M_RAIL)
  }
  // Pipework from the tanks up through the housing and away.
  for (const [u, col] of [[0.22, ALLOY], [0.88, ALLOY]] as const) {
    ebox(u - 0.035, 1.25, 0.6, u + 0.035, 1.46, 0.67, col as Rgb, M_METAL)
  }
  ebox(0.1, 1.9, 0.58, 1.4, 1.96, 0.65, ALLOY, M_METAL)
  // Pump with its mounts, and a dark grille over it.
  ebox(1.0, 0.5, 0.55, 1.42, 0.95, 0.9, PANEL, M_PANEL)
  ebox(1.04, 0.54, 0.9, 1.38, 0.91, 0.93, GRATE, M_SOFT)

  // ---- potable water dispensing point, where a sample is drawn
  ebox(1.7, 1.1, 0.0, 2.2, 1.6, 0.34, PANEL, M_PANEL)
  ebox(1.88, 1.16, 0.34, 1.98, 1.24, 0.44, ALLOY, M_METAL)
  b.quad(E(1.76, 1.32, 0.35), E(1.76, 1.46, 0.35), E(2.14, 1.46, 0.35), E(2.14, 1.32, 0.35), DARKMETAL, [0.3, 0.3, 1])
  // Sample pouches in a holder below it.
  ebox(1.76, 0.86, 0.06, 2.14, 1.06, 0.3, GRATE, M_SOFT)
  for (let i = 0; i < 3; i++) ebox(1.8 + i * 0.12, 0.9, 0.1, 1.88 + i * 0.12, 1.04, 0.26, BAG_2, M_SOFT)

  // ---- atmosphere: scrubber bed and a sensor head on the wall
  ebox(2.4, 0.3, 0.0, 3.3, 1.5, 0.5, PANEL_2, M_PANEL)
  for (let i = 0; i < 5; i++) ebox(2.48, 0.4 + i * 0.22, 0.5, 3.22, 0.56 + i * 0.22, 0.54, GRATE, M_SOFT)
  ebox(2.7, 1.6, 0.06, 2.9, 1.78, 0.2, ALLOY, M_METAL)
  ebox(2.74, 1.64, 0.2, 2.86, 1.74, 0.26, DARKMETAL, M_SOFT)
}

// ================================================== cable runs and stowage
/**
 * Cable runs.
 *
 * Every bundle here starts somewhere and ends somewhere: a junction box, a
 * rack connector, a deck-head tray. Cables that merely decorate a wall read as
 * scribble, and the brief was specific that they should not. Thickness and
 * colour vary by what a run carries — heavy grey for power, thin blue for
 * data, black for the general runs.
 */
export function cableRuns(b: Builder): void {
  const jbox = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    b.box(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, PANEL_2, M_PANEL)
    b.box(x - w / 2 - 0.012, y - h / 2 + 0.03, z - d / 2 - 0.012, x - w / 2, y + h / 2 - 0.03, z + d / 2 + 0.012, ALLOY, M_METAL)
    // Connector bosses on the face.
    for (let i = 0; i < 3; i++) {
      b.box(x - 0.045 + i * 0.045, y - h / 2 - 0.035, z - 0.02, x - 0.025 + i * 0.045, y - h / 2, z + 0.02, ALLOY, M_METAL)
    }
  }

  // A run down each side of the spine at deck-head height, from a junction
  // box at each module hatch into the tray overhead.
  const spine = ROOMS.find((r) => r.id === 'spine')!
  for (const side of [-1, 1] as const) {
    const wx = side < 0 ? spine.x0 + 0.17 : spine.x1 - 0.17
    const y = spine.height - 0.46
    for (const [z0, z1] of [[-27.4, -13.4], [-4.6, 3.4], [12.2, 14.2]] as const) {
      for (const [dy, thick, col] of [[0, 0.045, CABLE], [0.075, 0.03, RAIL], [0.13, 0.055, GRATE]] as const) {
        b.box(wx - thick, y + dy - thick, z0, wx + thick, y + dy + thick, z1, col as Rgb, M_RUBBER)
      }
      // Clamps at intervals, which is what stops a bundle reading as a pipe.
      for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.45) {
        b.box(wx - 0.075, y - 0.075, z - 0.028, wx + 0.075, y + 0.21, z + 0.028, ALLOY, M_METAL)
      }
    }
    // Junction boxes where the side modules branch off.
    for (const z of [-9.0, 8.0, -21.7]) {
      jbox(wx, y - 0.3, z, 0.1, 0.3, 0.42)
      // Drop from the box into the rack face below it.
      b.box(wx - 0.035, 1.9, z - 0.03, wx + 0.035, y - 0.44, z + 0.03, CABLE, M_RUBBER)
    }
  }

  // Branch runs into each side module, through the hatch collar and along the
  // module's own deck-head.
  for (const r of ROOMS) {
    if (r.id === 'spine' || r.id === 'command' || r.id === 'chamber') continue
    const inboard = r.x0 > 0 ? r.x0 : r.x1
    const dir = r.x0 > 0 ? 1 : -1
    const zc = (r.z0 + r.z1) / 2
    const y = r.height - 0.44
    for (const [dz, thick, col] of [[-0.12, 0.035, CABLE], [0, 0.03, RAIL], [0.12, 0.042, GRATE]] as const) {
      b.box(inboard, y - thick, zc + dz - thick, inboard + dir * (Math.abs(r.x1 - r.x0) - 0.5), y + thick, zc + dz + thick, col as Rgb, M_RUBBER)
    }
    for (let k = 1; k < 5; k++) {
      const x = inboard + dir * k * 1.1
      if (x < r.x0 || x > r.x1) continue
      b.box(x - 0.028, y - 0.07, zc - 0.2, x + 0.028, y + 0.2, zc + 0.2, ALLOY, M_METAL)
    }
    jbox(inboard + dir * 0.9, y - 0.26, zc, 0.36, 0.26, 0.12)
  }
}
