import { CATEGORIES, indicatorsFor } from '../../lib/indicators'
import { MISSION } from '../../data/mission'

/**
 * The system schematic, drawn as an engineering sheet of the period: white
 * line work on cobalt, extension and dimension lines, leader callouts and a
 * ruled title block. Every box on it is real — the five indicator families and
 * their counts come from the data layer, not from the drawing.
 */

const L = 'var(--cobalt-line)'

// Sheet geometry, held as constants so the line work and the lettering can
// never drift apart.
const BOX_W = 152
const BOX_H = 40
const GAP = 15
const STACK_TOP = 108
const BUS_X = 268
const DET_X = 344
const DET_W = 188
const SPINE_X = 586
const OUT_X = 646
const OUT_W = 144
const OUT_H = 48
const OUT_Y = [140, 0, 330] // middle filled in below
const BALLOON_X = 812

export function Blueprint({ className = '' }: { className?: string }) {
  const counts = CATEGORIES.map((c) => indicatorsFor(c.id).length)
  const total = counts.reduce((a, b) => a + b, 0)

  const inputs = CATEGORIES.map((c, i) => ({
    ...c,
    count: counts[i],
    y: STACK_TOP + i * (BOX_H + GAP),
  }))
  const stackBottom = STACK_TOP + CATEGORIES.length * (BOX_H + GAP) - GAP
  const midY = Math.round((STACK_TOP + stackBottom) / 2)
  const outY = [OUT_Y[0], midY - OUT_H / 2, OUT_Y[2]]
  const detTop = midY - 46
  const detBot = midY + 46

  return (
    <div className={`blueprint relative ${className}`}>
      <div className="stipple pointer-events-none absolute inset-0" />
      <svg viewBox="0 0 1000 560" className="relative block w-full" aria-label="AURORA system schematic">
        <defs>
          <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10" fill="none" stroke={L} strokeWidth="1.1" />
          </marker>
          <marker id="bp-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M2 8 L8 2" stroke={L} strokeWidth="1.1" />
          </marker>
        </defs>

        <g stroke={L} fill="none" strokeWidth="1">
          {/* Sheet border, double-ruled as a drawing frame is */}
          <rect x="14" y="14" width="972" height="532" />
          <rect x="22" y="22" width="956" height="516" strokeOpacity="0.4" />

          {/* Overall dimension, with extension lines */}
          <path d="M66 72 H790" markerStart="url(#bp-tick)" markerEnd="url(#bp-tick)" />
          <path d="M66 64 V80" strokeOpacity="0.7" />
          <path d="M790 64 V80" strokeOpacity="0.7" />

          {/* --- acquisition stack --------------------------------------- */}
          {inputs.map((c) => (
            <g key={c.id}>
              <rect x="66" y={c.y} width={BOX_W} height={BOX_H} />
              <path d={`M${66 + BOX_W} ${c.y + BOX_H / 2} H${BUS_X}`} />
              <circle cx={BUS_X} cy={c.y + BOX_H / 2} r="2.4" fill={L} stroke="none" />
            </g>
          ))}
          <path d={`M${BUS_X} ${STACK_TOP + BOX_H / 2} V${stackBottom - BOX_H / 2}`} strokeWidth="1.6" />
          <path d={`M${BUS_X} ${midY} H${DET_X - 6}`} markerEnd="url(#bp-arrow)" />

          {/* --- detection ----------------------------------------------- */}
          <rect x={DET_X} y={detTop} width={DET_W} height={detBot - detTop} />
          <path d={`M${DET_X} ${detTop + 54} H${DET_X + DET_W}`} strokeOpacity="0.35" />

          {/* --- distribution spine -------------------------------------- */}
          <path d={`M${DET_X + DET_W} ${midY} H${SPINE_X}`} />
          <path d={`M${SPINE_X} ${outY[0] + OUT_H / 2} V${outY[2] + OUT_H / 2}`} />
          {outY.map((y, i) => (
            <path key={i} d={`M${SPINE_X} ${y + OUT_H / 2} H${OUT_X - 6}`} markerEnd="url(#bp-arrow)" />
          ))}
          {outY.map((y, i) => (
            <rect key={i} x={OUT_X} y={y} width={OUT_W} height={OUT_H} />
          ))}

          {/* --- balloon callouts, keyed to the notes block --------------- */}
          <path d={`M${OUT_X + OUT_W} ${outY[0] + OUT_H / 2} H${BALLOON_X - 9}`} />
          <path d={`M${OUT_X + OUT_W} ${outY[2] + OUT_H / 2} H${BALLOON_X - 9}`} />
          <path d={`M${DET_X + DET_W / 2} ${detBot} V${detBot + 13}`} />
          <circle cx={BALLOON_X} cy={outY[0] + OUT_H / 2} r="9" />
          <circle cx={BALLOON_X} cy={outY[2] + OUT_H / 2} r="9" />
          <circle cx={DET_X + DET_W / 2} cy={detBot + 22} r="9" />

          {/* Notes block rule */}
          <path d="M66 436 H560" />

          {/* --- title block --------------------------------------------- */}
          <rect x={OUT_X} y="470" width="332" height="68" />
          <path d={`M${OUT_X} 492 H978`} />
          <path d={`M${OUT_X} 516 H978`} />
          <path d="M856 470 V538" />
        </g>

        {/* ------------------------------------------------------ lettering */}
        <g fill={L} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em' }}>
          <text x="428" y="62" textAnchor="middle">
            {MISSION.totalDays}-DAY MISSION PROFILE · {total} INDICATORS · CONTINUOUS ACQUISITION
          </text>

          {inputs.map((c) => (
            <g key={c.id}>
              <text x="77" y={c.y + 18}>{c.label.toUpperCase()}</text>
              <text x="77" y={c.y + 31} fillOpacity="0.6">{c.count} INDICATORS</text>
            </g>
          ))}

          <text x={DET_X + DET_W / 2} y={detTop + 24} textAnchor="middle" style={{ fontSize: 11, letterSpacing: '0.14em' }}>
            ROLLING BASELINE
          </text>
          <text x={DET_X + DET_W / 2} y={detTop + 42} textAnchor="middle" style={{ fontSize: 11, letterSpacing: '0.14em' }}>
            ANOMALY DETECTION
          </text>
          <text x={DET_X + DET_W / 2} y={detTop + 74} textAnchor="middle" fillOpacity="0.6">
            PER CREW MEMBER
          </text>

          {[
            ['STATUS SCORE', 'OPERATIONAL AID'],
            ['EARLY WARNING', 'WATCH · CAUTION'],
            ['WHAT-IF MODEL', 'FIRST-ORDER'],
          ].map(([a, b], i) => (
            <g key={a}>
              <text x={OUT_X + OUT_W / 2} y={outY[i] + 21} textAnchor="middle">{a}</text>
              <text x={OUT_X + OUT_W / 2} y={outY[i] + 35} textAnchor="middle" fillOpacity="0.6">{b}</text>
            </g>
          ))}

          {/* Balloon numbers */}
          <g style={{ fontSize: 10 }} textAnchor="middle">
            <text x={BALLOON_X} y={outY[0] + OUT_H / 2 + 3.5}>1</text>
            <text x={BALLOON_X} y={outY[2] + OUT_H / 2 + 3.5}>2</text>
            <text x={DET_X + DET_W / 2} y={detBot + 25.5}>3</text>
          </g>

          {/* Notes, as a drawing carries them */}
          <text x="66" y="430" style={{ letterSpacing: '0.2em' }}>NOTES</text>
          <text x="66" y="454" fillOpacity="0.78">1. STATUS SCORE IS AN OPERATIONAL AID, NOT A DIAGNOSIS.</text>
          <text x="66" y="470" fillOpacity="0.78">2. WHAT-IF MODEL IS ILLUSTRATIVE, NOT A VALIDATED PREDICTION.</text>
          <text x="66" y="486" fillOpacity="0.78">3. BASELINE IS THE INDIVIDUAL, NOT A POPULATION.</text>
          <text x="66" y="510" fillOpacity="0.55">4. ALL CREW VALUES IN THIS SYSTEM ARE SYNTHETIC.</text>

          {/* Title block */}
          <text x={OUT_X + 10} y="486" fillOpacity="0.6">DRAWING</text>
          <text x="866" y="486" fillOpacity="0.6">SHEET</text>
          <text x={OUT_X + 10} y="510">AURORA SYSTEM SCHEMATIC</text>
          <text x="866" y="510">1 OF 1</text>
          <text x={OUT_X + 10} y="532" fillOpacity="0.6">DWG. AUR-001 · SCALE: NONE</text>
          <text x="866" y="532" fillOpacity="0.6">REV. B</text>
        </g>
      </svg>
    </div>
  )
}
