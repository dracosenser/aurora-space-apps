import { ROOMS, STATIONS } from '../model/deck'

/**
 * The interior lighting rig.
 *
 * This used to live inside the renderer, where it was built once and then fed
 * to the fragment shader as a sixteen-element uniform array that every pixel
 * looped over. Profiling the structure pass with each shader term ablated in
 * turn showed that loop was 85 per cent of the frame — far more than the
 * shadow map, the tonemap, the cupola wash and the grazing sheen put together,
 * which between them came to under five per cent.
 *
 * The rig is static and so is the vessel, so there is no reason to pay for it
 * every frame. The list is exported here because two places now need it: the
 * geometry builder bakes each fixture's diffuse contribution into the vertices
 * once at startup, and the renderer still picks a few of them per frame for
 * the view-dependent highlight that baking cannot capture.
 */

export interface Fixture {
  /** World position. */
  p: readonly [number, number, number]
  /** Linear radiance. */
  c: readonly [number, number, number]
}

/**
 * Attenuation, shared by the bake and the shader so the two agree. A fixture
 * is a small panel a couple of metres away, not a point source at infinity,
 * so this is a softened inverse-square rather than a physical one.
 */
export function attenuation(dist2: number): number {
  return 1 / (1 + dist2 * 0.33)
}

/** Beyond this the contribution is under 3%, which is below a display's step. */
export const FIXTURE_RANGE2 = 90

function build(): Fixture[] {
  const out: Fixture[] = []
  for (const r of ROOMS) {
    const along = r.along ?? (r.z1 - r.z0 >= r.x1 - r.x0 ? 'z' : 'x')
    const a0 = along === 'z' ? r.z0 : r.x0
    const a1 = along === 'z' ? r.z1 : r.x1
    const cu = along === 'z' ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2
    const n = Math.max(1, Math.round((a1 - a0) / 5.2))
    for (let i = 0; i < n; i++) {
      const t = a0 + ((a1 - a0) * (i + 0.5)) / n
      out.push({
        p: [along === 'z' ? cu : t, r.height - 0.32, along === 'z' ? t : cu],
        // Slightly warm, as the fluorescent fixtures in the references read.
        c: [0.82, 0.8, 0.74],
      })
    }
  }
  // Console screens throw a cold wash onto the operator and the surrounding
  // rack faces. Dim, but it is what makes a workstation read as switched on.
  for (const s of STATIONS) {
    out.push({
      p: [s.x - Math.sin(s.facing) * 0.55, 1.35, s.z - Math.cos(s.facing) * 0.55],
      c: [0.1, 0.21, 0.3],
    })
  }
  return out
}

/**
 * Every fixture in the vessel. No cap: the old sixteen-light ceiling was a
 * shader limit, and with the diffuse baked there is no longer a reason for the
 * far end of the station to be unlit.
 */
export const FIXTURES: Fixture[] = build()
