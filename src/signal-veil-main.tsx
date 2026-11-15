import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { SignalVeilDemo } from './features/signal-veil'

// Standalone entry for SIGNAL VEIL (signal-veil.html). It shares the main
// application's stylesheet and theme choice but none of its navigation, so the
// feature can be demonstrated before it is wired into the main layout.
try {
  const saved = JSON.parse(localStorage.getItem('aurora.state.v1') ?? '{}') as { theme?: string }
  if (saved.theme === 'light' || saved.theme === 'dark') document.documentElement.dataset.theme = saved.theme
} catch {
  /* default theme */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="grain relative min-h-screen">
      <main className="relative z-10 mx-auto w-full max-w-[1680px] px-4 py-6 md:px-6">
        <SignalVeilDemo standalone />
      </main>
      <footer className="relative z-10 mt-6 border-t border-border px-4 py-5 md:px-6">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2">
          <span className="annotate">AURORA — SIGNAL VEIL</span>
          <span className="annotate hidden sm:inline">NASA SPACE APPS CHALLENGE 2026</span>
          <span className="annotate ml-auto text-ember">SYNTHETIC CREW DATA · NOT A NASA PRODUCT</span>
        </div>
      </footer>
    </div>
  </StrictMode>,
)
