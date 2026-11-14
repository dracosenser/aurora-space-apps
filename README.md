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
- Local data layer: seeded synthetic generator + `localStorage` for user state (no backend)

### Project structure

```
src/
  types/        Domain types (records, alerts, scenarios, sources)
  data/         Mission, crew, events, synthetic generator, scenario presets, sources
  lib/          Pure logic: stats, anomaly rules, health scoring, simulator, assistant, report
  hooks/        MissionProvider — the local data layer and app state
  components/   Reusable UI, charts, alert cards, timeline, tour, profile modal
  pages/        One component per section
docs/
  METHODOLOGY.md    Scientific methodology and model equations
  DATA_SOURCES.md   Real data sources and how each is used
  DEMO_SCRIPT.md    Five-minute demonstration script for judges
scripts/
  check-data.ts     Developer sanity check for the data pipeline
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
