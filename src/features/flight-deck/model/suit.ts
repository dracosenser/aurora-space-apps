/**
 * Extravehicular suit preparation.
 *
 * The brief for this was explicit that preparation must not be a button that
 * says READY. So the model below is a set of gates, each of which is opened by
 * a distinct action: four inspection points that have to be looked at
 * individually, four life-support readings that have to be acknowledged one at
 * a time, a comms loop that has to be selected, a tether that has to be
 * attached, and a donning order that refuses to take a helmet before the hard
 * upper torso. Nothing here completes on a timer and nothing completes by
 * standing nearby.
 *
 * ── On realism ────────────────────────────────────────────────────────────
 * The sequence is modelled on the real article at the level of structure and
 * naming only. The US EMU really is assembled around a hard upper torso with a
 * lower torso assembly, a liquid cooling and ventilation garment worn beneath
 * it, and a primary life support subsystem on the back; those are the parts
 * named here. What this is not is a procedure: the checks are a handful of
 * readings rather than the real checklist, the consumable figures are
 * plausible constants rather than a model of anything, and the order is a
 * simplification. It is a simulation for a monitoring tool, not training.
 */

export type SuitId = 'emu-1' | 'emu-2' | 'emu-3'

export interface Suit {
  id: SuitId
  /** Stencilled on the hard upper torso, as the real ones are. */
  marking: string
  /** Stripe that identifies a crew member on EVA, by its real convention. */
  stripe: 'none' | 'red' | 'broken-red'
  size: string
  /** Position of its rack in the EVA preparation module. */
  x: number
  z: number
  /** Suits out of service cannot be selected, and say why. */
  serviceable: boolean
  note: string
}

export const SUITS: Suit[] = [
  { id: 'emu-1', marking: 'EMU 3005', stripe: 'none', size: 'Medium HUT', x: -7.55, z: -24.1, serviceable: true, note: 'Serviced. Last loop scrub complete.' },
  { id: 'emu-2', marking: 'EMU 3009', stripe: 'red', size: 'Large HUT', x: -7.55, z: -22.5, serviceable: true, note: 'Serviced. Fan bearing within limits.' },
  { id: 'emu-3', marking: 'EMU 3011', stripe: 'broken-red', size: 'Medium HUT', x: -7.55, z: -20.9, serviceable: false, note: 'Out of service: sublimator flagged for inspection. Not available for this EVA.' },
]

// ------------------------------------------------------------- inspection
export type InspectionId = 'glove' | 'helmet' | 'torso' | 'plss'

export interface InspectionPoint {
  id: InspectionId
  label: string
  /** What a crew member is actually looking for. */
  looksFor: string
  finding: string
}

export const INSPECTION: InspectionPoint[] = [
  {
    id: 'glove',
    label: 'Gloves and wrist rings',
    looksFor: 'Cuts and abrasion on the palm restraint, bearing play at the wrist ring.',
    finding: 'Palm restraint intact. Wrist bearings turn freely, no play. Both rings latch.',
  },
  {
    id: 'helmet',
    label: 'Helmet and visor assembly',
    looksFor: 'Crazing in the pressure bubble, seating of the visor, condition of the neck ring.',
    finding: 'Bubble clear, no crazing. Sun visor slides and holds. Neck ring seal seated.',
  },
  {
    id: 'torso',
    label: 'Hard upper torso and LTA',
    looksFor: 'Waist seal, scye bearings, condition of the lower torso assembly.',
    finding: 'Waist ring clean and lubricated. Scye bearings smooth. No fabric damage on the LTA.',
  },
  {
    id: 'plss',
    label: 'Life support backpack',
    looksFor: 'Fan and pump audible, no contamination at the sublimator, latches secure.',
    finding: 'Fan and pump nominal on test. Sublimator feedwater port clean. Backpack latched.',
  },
]

// ----------------------------------------------------------- life support
export type ConsumableId = 'oxygen' | 'scrubber' | 'power' | 'feedwater'

export interface Consumable {
  id: ConsumableId
  label: string
  /** Synthetic reading, labelled as such wherever it is shown. */
  value: string
  /** Enough for the planned excursion? All four must be true to proceed. */
  ok: boolean
}

export const CONSUMABLES: Consumable[] = [
  { id: 'oxygen', label: 'Primary oxygen', value: '900 psi · about 7 h at nominal use', ok: true },
  { id: 'scrubber', label: 'CO2 removal', value: 'Scrubber bed fresh · vent loop clear', ok: true },
  { id: 'power', label: 'Battery', value: '27.4 V · about 7 h at nominal load', ok: true },
  { id: 'feedwater', label: 'Sublimator feedwater', value: 'Tanks full · cooling loop charged', ok: true },
]

export const COMMS_LOOPS = ['Loop A · primary', 'Loop B · backup', 'Loop A+B · both'] as const
export type CommsLoop = (typeof COMMS_LOOPS)[number]

export const TOOLS = [
  { id: 'pgt', label: 'Pistol grip tool', why: 'Bolt and fastener work at the worksites.' },
  { id: 'tether-short', label: 'Retractable equipment tether', why: 'Keeps a removed part attached to the suit.' },
  { id: 'wire-cutter', label: 'Cable connector tool', why: 'Mate and demate external connectors.' },
  { id: 'scoop', label: 'Inspection mirror and light', why: 'Reach and see behind mounted hardware.' },
] as const
export type ToolId = (typeof TOOLS)[number]['id']

// --------------------------------------------------------------- donning
/**
 * Donning order. The suit refuses anything out of sequence, which is the
 * point: the real garment physically cannot be assembled in another order,
 * and a checklist that lets you put a helmet on before a torso is a form
 * rather than a simulation.
 */
export const DONNING = [
  { id: 'lcvg', label: 'Liquid cooling and ventilation garment', detail: 'Worn next to the skin. Water tubing carries metabolic heat to the backpack.' },
  { id: 'lta', label: 'Lower torso assembly', detail: 'Legs, boots and waist ring. Stepped into from above.' },
  { id: 'hut', label: 'Hard upper torso', detail: 'Entered from below with the backpack already mounted. Waist rings mate here.' },
  { id: 'gloves', label: 'Gloves', detail: 'Wrist rings latched and checked by a second crew member.' },
  { id: 'helmet', label: 'Helmet and visor assembly', detail: 'Neck ring latched. The suit is sealed from this point.' },
  { id: 'purge', label: 'Purge and leak check', detail: 'Suit taken to working pressure and held while the gauge is watched.' },
] as const
export type DonningId = (typeof DONNING)[number]['id']

export interface SuitPrep {
  selected: SuitId | null
  inspected: InspectionId[]
  acknowledged: ConsumableId[]
  comms: CommsLoop | null
  tools: ToolId[]
  tetherAttached: boolean
  donned: DonningId[]
}

export function newSuitPrep(): SuitPrep {
  return { selected: null, inspected: [], acknowledged: [], comms: null, tools: [], tetherAttached: false, donned: [] }
}

export type PrepStage = 'select' | 'inspect' | 'life-support' | 'comms' | 'tether' | 'donning' | 'ready'

/** The stages, in order, with what each one needs before it is satisfied. */
export const STAGES: { id: PrepStage; label: string; need: (p: SuitPrep) => boolean; hint: string }[] = [
  { id: 'select', label: 'Select a suit', need: (p) => p.selected !== null, hint: 'Choose a serviceable suit from the rack.' },
  { id: 'inspect', label: 'Inspect the suit', need: (p) => p.inspected.length === INSPECTION.length, hint: 'Examine all four inspection points.' },
  { id: 'life-support', label: 'Verify life support', need: (p) => p.acknowledged.length === CONSUMABLES.length, hint: 'Check each consumable in turn.' },
  { id: 'comms', label: 'Verify communications', need: (p) => p.comms !== null, hint: 'Select and confirm a comms loop.' },
  { id: 'tether', label: 'Tether and tools', need: (p) => p.tetherAttached && p.tools.length >= 2, hint: 'Attach the safety tether and take at least two tools.' },
  { id: 'donning', label: 'Don the suit', need: (p) => p.donned.length === DONNING.length, hint: 'Work through the donning sequence in order.' },
]

/** The first unsatisfied stage, or 'ready'. */
export function stageOf(p: SuitPrep): PrepStage {
  for (const s of STAGES) if (!s.need(p)) return s.id
  return 'ready'
}

export function prepComplete(p: SuitPrep): boolean {
  return stageOf(p) === 'ready'
}

/** 0..1 across all stages, for the progress strip. */
export function prepProgress(p: SuitPrep): number {
  const done = STAGES.filter((s) => s.need(p)).length
  return done / STAGES.length
}

/**
 * The next garment in the donning order, or null when the suit is sealed.
 * Anything else offered is refused, so the sequence cannot be taken apart.
 */
export function nextDonning(p: SuitPrep): DonningId | null {
  for (const d of DONNING) if (!p.donned.includes(d.id)) return d.id
  return null
}

export function don(p: SuitPrep, id: DonningId): SuitPrep {
  if (nextDonning(p) !== id) return p
  return { ...p, donned: [...p.donned, id] }
}
