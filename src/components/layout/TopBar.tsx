import { useEffect, useRef, useState } from 'react'
import { Download, HelpCircle, Menu, Moon, Pause, Play, RotateCcw, Sun } from 'lucide-react'
import { useMission, ASTRONAUTS, EVENTS, MISSION } from '../../hooks/useMission'
import { phaseForDay } from '../../data/mission'
import { fmtDate, fmtElapsed } from '../../lib/format'
import { buildReport, downloadText } from '../../lib/report'
import { Button } from '../ui/Button'

/**
 * The status strip. Reads as the header of a mission-control console: a live
 * indicator, the mission's designation, and monospaced telemetry — with the
 * history scrubber treated as an instrument rather than a form control.
 */
export function TopBar({ onMenu, onTour }: { onMenu: () => void; onTour: () => void }) {
  const m = useMission()
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | null>(null)
  const phase = phaseForDay(m.viewDay)

  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      if (m.viewDay >= MISSION.currentDay) {
        setPlaying(false)
        return
      }
      m.setViewDay(m.viewDay + 2)
    }, 120)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [playing, m])

  const exportReport = () => {
    const text = buildReport({
      mission: MISSION,
      asOfDay: m.viewDay,
      astronauts: ASTRONAUTS,
      statuses: m.statuses,
      alerts: m.alerts,
      records: m.visibleRecords,
      events: EVENTS,
    })
    downloadText(`AURORA-report-MD${m.viewDay}.md`, text)
  }

  const pct = ((m.viewDay - 45) / (MISSION.currentDay - 45)) * 100

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/70 backdrop-blur-xl">
      <div className="flex h-[58px] items-center gap-3 px-4 md:px-6">
        <button className="rounded-sm p-1.5 text-muted transition-colors hover:text-text-strong lg:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>

        {/* Mission identity + telemetry */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
            <span className={`absolute h-2 w-2 rounded-full ${m.isLive ? 'bg-ok/30 pulse' : 'bg-warn/30'}`} />
            <span className={`h-1 w-1 rounded-full ${m.isLive ? 'bg-ok' : 'bg-warn'}`} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium text-text-strong">
              {MISSION.name}
              <span className="ml-2 font-normal text-muted">{phase.name}</span>
            </p>
            <p className="annotate truncate">
              MD {m.viewDay}/{MISSION.totalDays} · MET {fmtElapsed(m.viewDay)} · {fmtDate(m.viewDay)}
              <span className={m.isLive ? 'text-ok' : 'text-warn'}> · {m.isLive ? 'LIVE' : 'PLAYBACK'}</span>
            </p>
          </div>
        </div>

        {/* Desktop controls */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <div className="flex items-center gap-2.5 rounded-sm border border-border bg-surface-2/60 px-2.5 py-1.5">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="rounded-xs text-muted transition-colors hover:text-accent"
              aria-label={playing ? 'Pause playback' : 'Play mission history'}
              title="Historical mission playback"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <input
              type="range"
              min={45}
              max={MISSION.currentDay}
              value={m.viewDay}
              onChange={(e) => {
                setPlaying(false)
                m.setViewDay(parseInt(e.target.value, 10))
              }}
              className="w-36"
              style={{ ['--fill' as string]: `${pct}%` }}
              aria-label="Mission day"
              title="Scrub through mission history"
            />
            {m.isLive ? (
              <span className="annotate text-faint">REC</span>
            ) : (
              <button onClick={() => m.setViewDay(MISSION.currentDay)} className="eyebrow-sm text-accent transition-opacity hover:opacity-70">
                Live
              </button>
            )}
          </div>

          <span className="mx-1 h-5 w-px bg-border" />

          <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={exportReport} title="Export mission health report (Markdown)">
            Report
          </Button>
          <Button size="sm" variant="ghost" icon={<HelpCircle className="h-3.5 w-3.5" />} onClick={onTour} title="Guided demo">
            Tour
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={m.resetDemo} title="Reset demo data and settings">
            Reset
          </Button>
          <button
            onClick={() => m.setTheme(m.theme === 'dark' ? 'light' : 'dark')}
            className="rounded-sm border border-border p-2 text-muted transition-colors hover:border-border-strong hover:text-text-strong"
            aria-label="Toggle theme"
            title={m.theme === 'dark' ? 'Archival paper view' : 'Deep space view'}
          >
            {m.theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Compact controls */}
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <button onClick={exportReport} className="rounded-sm p-1.5 text-muted" aria-label="Export report">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={onTour} className="rounded-sm p-1.5 text-muted" aria-label="Tour">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button onClick={m.resetDemo} className="rounded-sm p-1.5 text-muted" aria-label="Reset demo">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={() => m.setTheme(m.theme === 'dark' ? 'light' : 'dark')} className="rounded-sm p-1.5 text-muted" aria-label="Toggle theme">
            {m.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}
