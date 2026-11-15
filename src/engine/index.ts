// CONSTELLATION ENGINE — public surface.
// Pure TypeScript: no React, no DOM, no rendering. Safe to run in Node.

export * from './types'
export { DEFAULT_CONFIG, resolveConfig, type EngineConfig, type DeepPartial } from './config'
export { createMissionAnalysis, type MissionAnalysis, type HistoryPoint, type DaySummary } from './analysis'
export { computeBaseline, computeIndicatorTimeline, findDeviationEpisodes, screenSeries, referenceEndFor, isSparse } from './timeline'
export { buildJointModel, computeJointStates, findPatternEpisodes, viewPattern, type JointModel } from './joint'
export { evaluateRelationships, findRelationship, detrend, effectiveSampleSize, supportingPairs, type SupportingPair } from './relationships'
export { describeIndicatorState, describeDay, STATUS_LABEL } from './explain'
export { evaluateResponse } from './response'
export { buildInsights } from './insights'
export * as robust from './robust'
