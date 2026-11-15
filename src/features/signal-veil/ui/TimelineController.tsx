import { History, Pause, Play, SkipBack, StepBack, StepForward } from 'lucide-react'
import type { MissionAnalysis } from '../../../engine/analysis'
import type { RecordedAction } from '../../../engine/types'
import type { VeilSnapshot } from '../model/snapshot'
import { SPEEDS, type ReplayPlan } from '../model/veilReducer'
import { Button } from '../../../components/ui/Button'
import { TimelineTrack } from './charts'

/**
 * Mission timeline: scrub, play, pause, reset and replay. Every position shows
 * the constellation exactly as the engine would have computed it that day.
 */
export function TimelineController({
  analysis,
  snapshot,
  actions,
  playing,
  speed,
  replay,
  onDay,
  onStep,
  onTogglePlay,
  onReset,
  onSpeed,
  onReplay,
  onStopReplay,
}: {
  analysis: MissionAnalysis
  snapshot: VeilSnapshot
  actions: readonly RecordedAction[]
  playing: boolean
  speed: number
  replay: ReplayPlan | null
  onDay: (day: number) => void
  onStep: (delta: number) => void
  onTogglePlay: () => void
  onReset: () => void
  onSpeed: (speed: number) => void
  onReplay: () => void
  onStopReplay: () => void
}) {
  const total = analysis.dataset.totalDays
  const day = snapshot.day
  const hasPattern = analysis.patternEpisodes.length > 0
  const todays = [...snapshot.events.map((e) => e.title), ...snapshot.actions.map((a) => `Recorded action: ${a.label}`)]

  return (
    <div className="panel rounded-md">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onReset} aria-label="Reset timeline to day 1" title="Reset to day 1" icon={<SkipBack className="h-3.5 w-3.5" />} />
          <Button size="sm" variant="ghost" onClick={() => onStep(-1)} aria-label="Previous day" title="Previous day" icon={<StepBack className="h-3.5 w-3.5" />} />
          <Button size="sm" variant="primary" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'} icon={playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}>
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onStep(1)} aria-label="Next day" title="Next day" icon={<StepForward className="h-3.5 w-3.5" />} />
        </div>

        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-faint">
          Speed
          <select className="h-7 rounded-sm border border-border-strong bg-surface-2/70 px-1.5 text-[11px] normal-case tracking-normal text-text-strong outline-none focus:border-accent" value={speed} onChange={(e) => onSpeed(parseInt(e.target.value, 10))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s} days/s
              </option>
            ))}
          </select>
        </label>

        {hasPattern &&
          (replay ? (
            <Button size="sm" variant="ember" onClick={onStopReplay} icon={<Pause className="h-3.5 w-3.5" />}>
              Stop replay
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onReplay} icon={<History className="h-3.5 w-3.5" />}>
              Replay how the pattern developed
            </Button>
          ))}

        <p className="mono ml-auto text-sm text-text-strong">
          DAY {String(day).padStart(3, '0')} <span className="text-faint">/ {total}</span>
        </p>
      </div>

      <div className="px-3 pt-2">
        <TimelineTrack analysis={analysis} day={day} actions={actions} onPickDay={onDay} />
        <input
          type="range"
          min={1}
          max={total}
          value={day}
          onChange={(e) => onDay(parseInt(e.target.value, 10))}
          className="sr-only"
          aria-label="Mission day"
          aria-valuetext={`Day ${day} of ${total}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-3 pt-1">
        <p className="text-xs leading-relaxed text-text" aria-live="polite">
          {replay && <span className="eyebrow-sm mr-2 text-ember">Replay</span>}
          {snapshot.caption}
        </p>
        {todays.length > 0 && <p className="annotate ml-auto">LOGGED TODAY · {todays.join(' · ')}</p>}
      </div>
    </div>
  )
}
