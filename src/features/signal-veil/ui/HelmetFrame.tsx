import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/**
 * First-person helmet: the visitor looks out through a curved visor from
 * inside an EVA helmet. Shell, seal, glass curvature, the raised gold
 * sun-shade edge and the glare are all CSS; nothing here is an image.
 *
 * The reflections shift slightly against the pointer, the way they do when
 * you move your head inside a helmet. All layers ignore pointer events, so
 * the visor canvas beneath stays fully interactive.
 */

const VISOR_RADIUS = '30% 30% 34% 34% / 36% 36% 46% 46%'

const SHELL: CSSProperties = {
  background: 'linear-gradient(180deg, #1b2336 0%, #0e1422 38%, #070a13 100%)',
  border: '1px solid rgba(160, 185, 230, 0.16)',
  boxShadow: 'inset 0 1px 0 rgba(205, 222, 255, 0.14), inset 0 -22px 44px rgba(0, 0, 0, 0.55), 0 24px 60px rgba(0, 0, 0, 0.45)',
}

const SEAL: CSSProperties = {
  borderRadius: VISOR_RADIUS,
  background: 'linear-gradient(180deg, #03050a 0%, #121925 100%)',
  boxShadow: 'inset 0 0 0 1px rgba(150, 176, 222, 0.2), inset 0 3px 8px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(205, 222, 255, 0.08)',
}

export function HelmetFrame({ top, bottom, children }: { top: ReactNode; bottom: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--hx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
    el.style.setProperty('--hy', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3))
  }

  return (
    <div ref={ref} onPointerMove={onMove} className="relative rounded-[30px] p-2.5 md:rounded-[44px] md:p-4" style={SHELL}>
      {/* Fasteners */}
      {['left-3 top-3', 'right-3 top-3', 'left-3 bottom-3', 'right-3 bottom-3'].map((pos) => (
        <span key={pos} aria-hidden="true" className={`absolute ${pos} hidden h-2 w-2 rounded-full md:block`} style={{ background: 'radial-gradient(circle at 35% 30%, #56627a, #0b0f18 70%)', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)' }} />
      ))}

      {/* Upper rim: engraved plate */}
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pb-2 md:px-8">{top}</div>

      <div className="p-1.5 md:p-2" style={SEAL}>
        <div className="relative overflow-hidden" style={{ borderRadius: VISOR_RADIUS, background: '#02040a' }}>
          {children}

          {/* ---- Visor optics (decorative, non-interactive) ---- */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {/* Raised gold sun-shade: its lower edge curves across the top of the view. */}
            <div
              className="absolute inset-x-0 top-0 h-[16%]"
              style={{
                background: 'radial-gradient(ellipse 74% 100% at 50% 0%, rgba(255, 190, 92, 0.26) 0%, rgba(255, 168, 60, 0.1) 58%, rgba(255, 168, 60, 0.03) 64%, transparent 66%)',
                transform: 'translate3d(0, calc(var(--hy, 0) * -3px), 0)',
              }}
            />
            {/* Reflections that drift as the head moves. */}
            <div
              className="absolute -inset-[6%]"
              style={{
                background:
                  'linear-gradient(113deg, transparent 27%, rgba(196, 218, 255, 0.075) 34%, rgba(196, 218, 255, 0.015) 43%, transparent 49%), radial-gradient(ellipse 26% 15% at 24% 15%, rgba(226, 238, 255, 0.11), transparent 72%), radial-gradient(ellipse 18% 8% at 78% 90%, rgba(255, 196, 120, 0.05), transparent 75%)',
                transform: 'translate3d(calc(var(--hx, 0) * -14px), calc(var(--hy, 0) * -9px), 0)',
                transition: 'transform 0.25s ease-out',
              }}
            />
            {/* Curvature: the glass darkens and thickens toward its edge. */}
            <div className="absolute inset-0" style={{ borderRadius: VISOR_RADIUS, boxShadow: 'inset 0 0 70px 26px rgba(2, 4, 10, 0.78), inset 0 0 0 1px rgba(176, 204, 255, 0.28), inset 0 10px 26px rgba(120, 160, 230, 0.07)' }} />
          </div>
        </div>
      </div>

      {/* Lower rim */}
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-2 md:px-8">{bottom}</div>
    </div>
  )
}
