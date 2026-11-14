import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import type { Astronaut } from '../types'
import type { AstronautStatus } from '../lib/health'
import { INDICATORS } from '../lib/indicators'
import { Avatar } from './ui/Misc'
import { Badge, statusTone } from './ui/Badge'
import { ScoreRing, Sparkline } from './charts/Sparkline'

export function AstronautCard({ astronaut, status, onOpen, index = 0 }: { astronaut: Astronaut; status: AstronautStatus; onOpen: () => void; index?: number }) {
  const spark = (key: 'restingHR' | 'sleepDuration' | 'fatigue') => status.recent.map((r) => r[key])
  const latest = status.latest
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={onOpen}
      className="group flex flex-col rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/50"
    >
      <div className="flex items-start gap-3">
        <Avatar astronaut={astronaut} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-text-strong">{astronaut.name}</p>
            <span className="mono text-[10px] text-muted">{astronaut.id}</span>
          </div>
          <p className="truncate text-xs text-muted">{astronaut.role}</p>
        </div>
        <ScoreRing score={status.score} size={48} stroke={4} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Badge tone={statusTone(status.status)} dot>
          {status.status}
        </Badge>
        <span className="text-[11px] text-muted">{status.activeAlerts.length} active alert{status.activeAlerts.length === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Mini label="Rest HR" value={latest ? `${latest.restingHR}` : '—'} unit="bpm" values={spark('restingHR')} color={INDICATORS.restingHR.color} />
        <Mini label="Sleep" value={latest ? latest.sleepDuration.toFixed(1) : '—'} unit="h" values={spark('sleepDuration')} color={INDICATORS.sleepDuration.color} />
        <Mini label="Fatigue" value={latest ? latest.fatigue.toFixed(1) : '—'} unit="/10" values={spark('fatigue')} color={INDICATORS.fatigue.color} />
      </div>
      <p className="mt-3 line-clamp-1 text-[11px] text-muted">{status.drivers[0]}</p>
      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
        Open profile <ChevronRight className="h-3 w-3" />
      </span>
    </motion.button>
  )
}

function Mini({ label, value, unit, values, color }: { label: string; value: string; unit: string; values: number[]; color: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mono text-sm font-semibold text-text-strong">
        {value}
        <span className="ml-0.5 text-[10px] font-normal text-muted">{unit}</span>
      </p>
      <Sparkline values={values} color={color} width={72} height={20} />
    </div>
  )
}
