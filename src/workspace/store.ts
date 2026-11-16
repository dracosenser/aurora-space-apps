import { useSyncExternalStore } from 'react'
import { emptyWorkspace, parseWorkspace } from './ops'
import type { Workspace } from './types'

/**
 * Where the user's own mission lives. It is kept in this browser's
 * localStorage under its own key, separate from the demonstration state, so
 * "Reset demo" elsewhere in the application never deletes entered data.
 */

const KEY = 'aurora.workspace.v1'

function load(): Workspace {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyWorkspace()
    return parseWorkspace(JSON.parse(raw)) ?? emptyWorkspace()
  } catch {
    return emptyWorkspace()
  }
}

let current: Workspace | null = null
const listeners = new Set<() => void>()

function get(): Workspace {
  if (!current) current = load()
  return current
}

function set(next: Workspace): void {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full or unavailable: keep working in memory */
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const workspaceStore = {
  get,
  set,
  /** Apply a pure operation from ops.ts. */
  update: (fn: (ws: Workspace) => Workspace) => set(fn(get())),
  subscribe,
  clear: () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    set(emptyWorkspace())
  },
}

/** The current workspace and a function to apply an edit to it. */
export function useWorkspace(): [Workspace, (fn: (ws: Workspace) => Workspace) => void] {
  const ws = useSyncExternalStore(subscribe, get, get)
  return [ws, workspaceStore.update]
}
