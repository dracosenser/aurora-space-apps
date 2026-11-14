import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import type { Astronaut } from '../types'
import type { AstronautStatus } from '../lib/health'
import { INDICATORS } from '../lib/indicators'
import { Avatar } from './ui/Misc'
import { Badge, statusTone } from './ui/Badge'
import { ScoreRing, Sparkline } from './charts/Sparkline'

/** A crew member's file: identity, standing, and three indicators at a glance. */
export function AstronautCard({ astronaut, status, onOpen, index = 0 }: { astronaut: Astronaut; status: AstronautStatus; onOpen: () => void; index?: number }) {
  const spark = (key: 'restingHR' | 'sleepDuration' | 'fatigue') => status.recent.map((r) => r[key])
  const latest = status.latest

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      className="panel group relative flex flex-col overflow-hidden rounded-md p-4 text-left transition-colors duration-300 hover:border-border-strong"
    >
      {/* Crew colour declares itself on approach */}
      <span
        className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
        style={{ background: astronaut.color, opacity: 0.6 }}
      />

      <div className="flex items-start gap-3">
        <Avatar astronaut={astronaut} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-text-strong">{astronaut.name}</p>
          <p className="truncate text-[11px] leading-snug text-muted">{astronaut.role}</p>
          <p className="annotate mt-1 truncate">{astronaut.id}</p>
        </div>
        <ScoreRing score={status.score} size={46} stroke={3} />
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2">
        <Badge tone={statusTone(status.status)} dot>
          {status.status}
        </Badge>
        <span className="annotate">
          {status.activeAlerts.length} ACTIVE ALERT{status.activeAlerts.length === 1 ? '' : 'S'}
        </span>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border pt-3.5">
        <Mini label="Rest HR" value={latest ? `${latest.restingHR}` : '—'} unit="bpm" values={spark('restingHR')} color={INDICATORS.restingHR.color} />
        <Mini label="Sleep" value={latest ? latest.sleepDuration.toFixed(1) : '—'} unit="h" values={spark('sleepDuration')} color={INDICATORS.sleepDuration.color} />
        <Mini label="Fatigue" value={latest ? latest.fatigue.toFixed(1) : '—'} unit="/10" values={spark('fatigue')} color={INDICATORS.fatigue.color} />
      </div>

      <p className="mt-3.5 line-clamp-1 text-[11px] leading-relaxed text-muted">{status.drivers[0]}</p>

      <span className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        Open file <ChevronRight className="h-3 w-3" />
      </span>
    </motion.button>
  )
}

function Mini({ label, value, unit, values, color }: { label: string; value: string; unit: string; values: number[]; color: string }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow-sm">{label}</p>
      <p className="mono mt-1 text-[13px] font-medium text-text-strong">
        {value}
        <span className="ml-0.5 text-[9px] font-normal text-muted">{unit}</span>
      </p>
      <Sparkline values={values} color={color} width={72} height={20} />
    </div>
  )
}
