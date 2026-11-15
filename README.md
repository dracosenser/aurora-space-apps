# AURORA — Astronaut Health Intelligence Platform

**Autonomous Understanding of Risk, Observation & Astronaut Resilience**
*NASA Space Apps Challenge 2026*

> “Because every explorer matters. Every signal counts.”

AURORA is an astronaut health-monitoring and mission-intelligence platform for long-duration lunar and Mars missions. It combines continuous multivariable health monitoring, explainable anomaly detection, an interactive mission what-if simulator, and a data-grounded assistant in a mission-control-style web application.

The demo ships with a fictional 900-day Mars mission (**Ares Meridiani**, crew of four) on mission day 412, preloaded with historical health records, injected anomalies, mission events and scenario presets. **All crew data is synthetic and labelled as such.** All scientific sources cited in the app are real.

---

## Quick start

Requirements: Node.js 18+ (tested on Node 24) and npm.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. No API keys, accounts or backend services are required.

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and produces a static production build in `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run typecheck` | TypeScript check only |
| `npx tsx scripts/check-data.ts` | Prints the generated dataset, detected alerts, statuses and sample assistant answers |
| `npm run archive` | Downloads the NASA archival photography the design uses into `public/archive/` and records its provenance |

The production build is fully static (`dist/`) and can be hosted on GitHub Pages, Netlify, Vercel or any static file server. `vite.config.ts` uses a relative `base` so it works from a sub-path.

---

## What is inside

| Section | Purpose |
|---|---|
| **Mission Control** | Mission elapsed time, phase, crew size, crew composite status, individual astronaut cards with sparklines, 90-day crew trend chart, recent alerts, interactive mission timeline, event log, optional live NASA space-weather feed |
| **Crew Health Analytics** | Five categories (cardiovascular, sleep, physical, radiation, behavioral), 15 indicators, date-range presets and custom ranges, individual vs crew comparison, alert windows and mission events drawn on charts, 7-day smoothing, historical trend table |
| **Early Warning Intelligence** | Explainable rule-based anomaly detection. Each alert shows what changed, when, which indicators, why it fired, confidence with rationale, and what to review. Filters by status, severity and crew member |
| **Mission What-If Simulator** | Duration, sleep disruption, exercise frequency, radiation scenario and stress level. Live baseline-vs-scenario curves for seven indicators, end-of-mission deltas, generated explanation, operational considerations, explicit assumptions. Four presets |
| **AI Mission Assistant** | Local rule-based assistant that answers questions by computing over the loaded data, exposes reasoning, separates facts from hypotheses, and never diagnoses. No external AI service |
| **Sources & Science** | Every real NASA program, dataset, standard and paper that informed the project, with description, what it represents, limitations and how it is used |
| **Space Apps Presentation** | Problem, relevance, how it works, NASA contribution, innovation, limitations and future work |

Extra features: historical mission playback (top-bar slider recomputes every alert and score for any past day), astronaut profile pages, exportable Markdown mission health report, dark/light mode, guided demo tour, demo reset button, responsive layout.

---

## Technology

- React 18 + Vite 6 + TypeScript (strict)
- Tailwind CSS 4
- Recharts, Lucide React, Framer Motion
- Instrument Serif, IBM Plex Sans and IBM Plex Mono (Google Fonts)
- Local data layer: seeded synthetic generator + `localStorage` for user state (no backend)

---

## Design system

AURORA is built as a **historical NASA archive redesigned for the modern web**: the
visual language comes from Apollo-era documentation — engineering blueprints,
trajectory plotting charts, photographic contact sheets — not from a space theme
applied to a dashboard. Everything is matte. There is no gloss, glow, gradient
lighting or glassmorphism anywhere, and every corner is square.

**Three document stocks.** The page is matte black (`#101010`) through charcoal
(`#191919`) and graphite (`#292929`), with warm off-white (`#E5E2DA`) and dusty
silver (`#A5A5A0`) for type. Punctuating it are two real stocks, used as surfaces
rather than accents:

| Stock | Where | Token |
|---|---|---|
| Cobalt engineering sheet | `.blueprint` | `--cobalt #1A4078`, white line work |
| Aged chart stock | `.stock` | `--paper #DDD6C4`, `--ink #15130E` |
| Rust ink | callouts, caution marks | `--rust #A8512C` |

**The three archival documents** carry the interface rather than cards:

- **`Blueprint`** — the system schematic drawn as an engineering sheet: dimension
  line, acquisition stack, balloon callouts, a NOTES block and a ruled title block
  (`DWG. AUR-001`). The five indicator families and their counts are read from the
  data layer, so the drawing is accurate, not decorative.
- **`PlottingChart`** — the mission profile as a polar chart on aged stock, after
  the trajectory charts issued for Apollo. Angle is mission day around the full
  circle; radius is the mission phase. Events sit at their own day and phase, with
  a typed significant-events table beside them. It replaces the old linear timeline
  and keeps click-to-set-day.
- **`ContactSheet`** — frames mounted as prints on trimmed paper mats with typed
  caption strips, laid out as a contact sheet with fixed offsets.

**Three voices.** Newsreader for editorial serif headings and pull quotes, IBM Plex
Sans for the interface, IBM Plex Mono for telemetry, catalogue numbers and every
annotation on a drawing. `.eyebrow` sets stencilled caps; `.annotate` sets margin
notes. Sections are numbered as plates, figures and drawings.

**Texture.** Paper fibre on the page (`body::before`), film grain over the frame
(`.grain`), a halftone screen on every photograph, a stipple screen on the
blueprint, and reticle crosses on survey frames — all generated from CSS and
inline SVG, with no texture assets.

**Photography.** `npm run archive` pulls the frames from NASA's public image
library into `public/archive/` and writes real provenance to
`src/data/archiveCredits.ts`. Nothing is hard-coded: each slot is resolved by
querying the library, so the credits are the ones NASA supplies. Frames render
monochrome and matte through `.photo`. Until the script runs, each plate shows as
an empty archival sleeve with its reference printed on it — a designed state, not
a broken image.

> NASA imagery is generally not subject to copyright in the United States, but the
> **NASA insignia and logotype are not public domain** and are used nowhere in this
> project. The AURORA mark in `components/visual/Insignia.tsx` is original.

**Two themes.** Dark is the archive. Light is the same archive printed on warm
stock. Both run off the custom properties at the top of `src/index.css`.

**Motion** is deliberately slight and respects `prefers-reduced-motion`: slow
photographic parallax, gentle plate reveals, nothing else. The design is intended
to be beautiful completely static.

### Project structure

```
src/
  types/        Domain types (records, alerts, scenarios, sources)
  data/         Mission, crew, events, synthetic generator, scenario presets, sources
  lib/          Pure logic: stats, anomaly rules, health scoring, simulator, assistant, report
  hooks/        MissionProvider — the local data layer and app state
  components/   Reusable UI, charts, alert cards, timeline, tour, profile modal
    visual/     Blueprint, plotting chart, contact sheet, plates, insignia
  pages/        One component per section
docs/
  METHODOLOGY.md    Scientific methodology and model equations
  DATA_SOURCES.md   Real data sources and how each is used
  DEMO_SCRIPT.md    Five-minute demonstration script for judges
public/
  archive/          NASA archival photography (populated by npm run archive)
scripts/
  check-data.ts     Developer sanity check for the data pipeline
  fetch-archive.mjs Resolves and downloads the archival frames, writes credits
```

The data layer (`src/data`, `src/lib`) has no React dependency and can be unit-tested or reused independently.

---

## Scientific honesty

- Every crew value, event, alert and simulator curve is **simulated**. The UI marks this on every page.
- Magnitudes in the generator and simulator are **informed by** published spaceflight research (MSL/RAD radiation measurements, ISS sleep actigraphy, bone and muscle studies, NASA-STD-3001 exposure limits). See `docs/METHODOLOGY.md` and `docs/DATA_SOURCES.md`.
- Anomalies are statistical deviations from a crew member's own baseline. **They are not diagnoses.**
- The simulator is an illustrative first-order model, not a validated medical prediction.
- AURORA has no NASA partnership or endorsement. The optional space-weather panel calls NASA's public DONKI API with the rate-limited `DEMO_KEY` and is clearly separated from the simulated mission.

---

## Deliverables checklist

1. Complete working source code — this repository
2. Polished, fully functional website — `npm run dev` / `npm run build`
3. Dependencies and configuration — `package.json`, `vite.config.ts`, `tsconfig*.json`
4. Setup instructions — this README
5. Scientific methodology — `docs/METHODOLOGY.md`
6. Real data sources — `docs/DATA_SOURCES.md` and the in-app Sources & Science section
7. Demonstration script — `docs/DEMO_SCRIPT.md`

---

## License

MIT. Fictional mission and crew; no real person is depicted.
