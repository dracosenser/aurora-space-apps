import type { MissionEventRecord, Provenance, RecordedAction } from '../engine/types'

/**
 * The Workbench data model: a mission the user defines themselves, with their
 * own crew, their own measurements and their own space conditions.
 *
 * Pure data. No React, no DOM. Everything here is serialisable to JSON.
 */

/** Subject key for measurements of the environment, shared by the whole crew. */
export const ENV_SUBJECT = '@environment'

export interface WorkspaceCrew {
  id: string
  name: string
  role: string
  color: string
}

export interface WorkspaceIndicator {
  id: string
  label: string
  shortLabel: string
  unit: string
  category: string
  decimals: number
  /** Expected days between observations: 1 = daily, 7 = weekly. */
  cadenceDays: number
  collection: string
  /** Physically plausible range. Readings outside it are kept but excluded from analysis. */
  plausibleRange: [number, number]
  resolution: number
  /** 'crew' is measured on each person; 'environment' is one shared series. */
  scope: 'crew' | 'environment'
  builtin: boolean
  /** Whether it appears in the entry grid. Disabling never deletes data. */
  enabled: boolean
}

export interface MissionPhase {
  id: string
  name: string
  startDay: number
  endDay: number
  /** Gravity level in g (0 = microgravity, 0.165 = Moon, 0.38 = Mars, 1 = Earth). */
  gravity: number
}

export interface WorkspaceMission {
  name: string
  destination: string
  /** Planned mission length in days. */
  totalDays: number
  /** The latest mission day there is data for. */
  currentDay: number
}

export type BaselineChoice = 'auto' | 'reference' | 'rolling'

export interface Workspace {
  version: 1
  mission: WorkspaceMission
  crew: WorkspaceCrew[]
  indicators: WorkspaceIndicator[]
  /** readings[subject][indicatorId][day] = value. Subject is a crew id or ENV_SUBJECT. */
  readings: Record<string, Record<string, Record<number, number>>>
  /** Where each series came from: provenance[subject][indicatorId]. */
  provenance: Record<string, Record<string, Provenance>>
  phases: MissionPhase[]
  events: MissionEventRecord[]
  /** Recorded protocol actions, by crew id. */
  actions: Record<string, RecordedAction[]>
  baseline: BaselineChoice
  updatedAt: number
}

export interface ReadingRow {
  subject: string
  indicatorId: string
  day: number
  value: number
}
