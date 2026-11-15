// SIGNAL VEIL — public surface of the feature.
//
//   <SignalVeilDemo />        the built-in 150-day demonstration, no props needed
//   <SignalVeilExperience />  the full feature for any MissionDataset
//   <SignalVeilCanvas />      the visor and constellation alone, fully controlled
//
// See docs/SIGNAL_VEIL.md for integration instructions.

export { SignalVeilDemo } from './SignalVeilDemo'
export { SignalVeilExperience, type SignalVeilExperienceProps, type ExperienceProgress } from './SignalVeilExperience'
export { SignalVeilCanvas, type SignalVeilCanvasProps, type LensTarget } from './SignalVeilCanvas'
export { buildSnapshot, type VeilSnapshot, type NodeSnapshot, type LinkSnapshot, type PatternSnapshot } from './model/snapshot'
export { buildLayout, hitTestNode, linkKey, CATEGORY_COLORS, type VeilLayout, type VeilNode } from './model/layout'
export { WipeMask } from './model/wipeMask'
export { PointerController, type PointerEffect } from './model/pointer'
export { veilReducer, initialVeilState, type VeilState, type VeilAction, type PanelId, type ReplayPlan } from './model/veilReducer'
