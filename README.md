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
| **Self-Assessment** | The crew member's own station. Eight readings taken and entered by hand, each with how to take it, why it matters in spaceflight, a reference band drawn to scale and a written action for the band it lands in. A clickable human figure opens five body systems. Duty-period countdown, readiness instrument, protocols and mission patches |
| **Signal Veil** | The signature instrument, now a page of the application rather than a separate demo. A fogged EVA visor you wipe clear to reveal one crew member's health signals as a constellation, driven by the Constellation Engine. Inspect a signal, draw a connection, scrub the mission timeline, replay how a pattern developed, record a response. Runs on the app's own crew records, with a crew switcher |
| **Mission Control** | Mission elapsed time, phase, crew size, crew composite status, individual astronaut cards with sparklines, 90-day crew trend chart, recent alerts, interactive mission timeline, event log, optional live NASA space-weather feed |
| **Crew Health Analytics** | Five categories (cardiovascular, sleep, physical, radiation, behavioral), 15 indicators, date-range presets and custom ranges, individual vs crew comparison, alert windows and mission events drawn on charts, 7-day smoothing, historical trend table |
| **Early Warning Intelligence** | Explainable rule-based anomaly detection. Each alert shows what changed, when, which indicators, why it fired, confidence with rationale, and what to review. Filters by status, severity and crew member |
| **Mission What-If Simulator** | Duration, sleep disruption, exercise frequency, radiation scenario and stress level. Live baseline-vs-scenario curves for seven indicators, end-of-mission deltas, generated explanation, operational considerations, explicit assumptions. Four presets |
| **AI Mission Assistant** | Local rule-based assistant that answers questions by computing over the loaded data, exposes reasoning, separates facts from hypotheses, and never diagnoses. No external AI service |
| **Sources & Science** | Every real NASA program, dataset, standard and paper that informed the project, with description, what it represents, limitations and how it is used |
| **Space Apps Presentation** | Problem, relevance, how it works, NASA contribution, innovation, limitations and future work |

Extra features: historical mission playback (top-bar slider recomputes every alert and score for any past day), astronaut profile pages, exportable Markdown mission health report, dark/light mode, guided demo tour, demo reset button, responsive layout.

### One game, two instruments

The self-assessment and Signal Veil share a single board. `src/lib/gamify.ts`
holds the score, the streak and the patches; `CrewLog.veil` records which Signal
Veil steps have been worked, and the nine steps bank points onto the same total
as a measurement battery. Three of the ten patches are earned in the visor —
**Visor Clear**, **First Contact** and **Signal Read** — and they appear on the
same patch grid as the self-assessment's. Steps bank once, so revisiting the
visor cannot farm points, and `Reset demo` clears both halves.

The two pages are deliberately different kinds of work. The self-assessment is
the crew member measuring themselves and acting on a number. Signal Veil is the
same crew member looking for what no single number shows: several indicators
that each moved too little to trip an alert, but moved together.

### The self-assessment loop

The challenge asks for software an astronaut uses on themselves, so this page is
built around a crew member who has no clinician in the room and must decide what
to do next. It is a loop, not a dashboard:

1. **A duty period opens.** A fifteen-minute window counts down on real time.
   When it expires the strip turns amber and breathes, and readiness holds at the
   last complete battery rather than silently decaying.
2. **Eight readings are entered by hand** — blood pressure, heart rate, SpO₂,
   core temperature, blood glucose, sleep and mood. Nothing on the page is sensed
   automatically, which is the honest version of a self-assessment tool.
3. **Each reading is placed against its reference band**, drawn to scale so the
   value's position is visible rather than asserted, and classified nominal /
   watch / action.
4. **The band produces a written instruction.** Never a diagnosis, never a
   treatment — retake in an hour, log an accompanying symptom, or contact the
   flight surgeon. Every escalation routes to the flight surgeon, which is what
   the real protocol does.
5. **Readiness, streaks, points and patches** close the loop. Completing a full
   battery extends the streak; seven patches mark things actually achieved
   (first complete battery, a clean sweep, a steady run) rather than participation.

Points are an **engagement score for a simulation**, labelled as such on the page.
They are not a health score, and the page says so where a user would otherwise
assume otherwise.

---

## Technology

- React 18 + Vite 6 + TypeScript (strict)
- WebGL2 (GLSL ES 3.00) for the visor fog, with a Canvas 2D fallback
- Vitest — 136 tests over the engine and the visor's pure model
- Tailwind CSS 4
- Recharts, Lucide React, Framer Motion
- Instrument Serif, IBM Plex Sans and IBM Plex Mono (Google Fonts)
- Local data layer: seeded synthetic generator + `localStorage` for user state (no backend)

---

## Design system

AURORA is built as **historical NASA documentation redesigned for the modern web**: the
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


**Three voices.** Newsreader for editorial serif headings and pull quotes, IBM Plex
Sans for the interface, IBM Plex Mono for telemetry, catalogue numbers and every
annotation on a drawing. `.eyebrow` sets stencilled caps; `.annotate` sets margin
notes. Sections are numbered as plates, figures and drawings.

**Colour carries one meaning each.** Instrument colour is on a semantic axis, not a
palette: desaturated cyan (`--info-cyan`) is passive data and never means "good";
sage (`--screen-glow`) is nominal; amber (`--alert-amber`) is the only colour that
asks for an action; red (`--danger-red`) is reserved for a threshold crossed.
Because colour is load-bearing, every status also carries a shape — a filled tick,
a hollow square, a word — so the page survives being read in greyscale or by
someone who cannot separate the two warm hues.

**The two instruments** are drawn, not charted:

- **`ThreeRing`** — the readiness dial. An outer scale ring, a value track and an
  inner figure, each reading at a different distance so the eye lands on the number
  first and the context second.
- **`BodyFigure`** — the clickable human figure the challenge asks for, drawn as
  line work in a 200 × 380 field. Five systems are hit regions that fill with their
  current status and run leader lines out to a margin index, the way a labelled
  plate in a textbook does. Selecting a system shows what it does, what happens to
  it in long-duration flight, which of the five hazards drive it, the readings that
  bear on it and the countermeasures flown against it.

**Motion has a tempo.** 2.5s for the one sanctioned attention loop (`.breathe`,
used only where something genuinely needs an answer), 240ms for entrances, 30ms of
stagger between siblings, and nothing under 500ms that repeats. There are no
bounces and no spring overshoot; everything eases on a single curve
(`--ease-out`). All of it respects `prefers-reduced-motion`.

**Texture.** Paper fibre on the page (`body::before`), film grain over the frame
(`.grain`), a halftone screen on every photograph, a stipple screen on the
blueprint, and reticle crosses on survey frames — all generated from CSS and
inline SVG, with no texture assets.


**Two themes.** Dark is the console. Light is the same document printed on warm
stock. Both run off the custom properties at the top of `src/index.css`.

**Motion** is deliberately slight and respects `prefers-reduced-motion`: slow
photographic parallax, gentle plate reveals, nothing else. The design is intended
to be beautiful completely static.

### Project structure

```
src/
  types/        Domain types (records, alerts, scenarios, sources)
  data/         Mission, crew, events, synthetic generator, scenario presets, sources
  engine/       Constellation Engine: baselines, deviation, patterns, relationships,
                joint statistics, timeline, response. No React, no DOM, 136 tests
  features/
    signal-veil/  The visor: model (pure, tested), render (Canvas 2D + WebGL2
                  fog shader), ui (panels, charts, timeline, data table)
  lib/          Pure logic: stats, anomaly rules, health scoring, simulator, assistant, report
                gamify.ts — protocols, patches, readiness, streaks, duty periods,
                and the Signal Veil step board
  hooks/        MissionProvider — the local data layer and app state
  components/   Reusable UI, charts, alert cards, tour, profile modal
    visual/     Blueprint, plotting chart, contact sheet, body figure, three-ring, insignia
  pages/        One component per section
docs/
  METHODOLOGY.md    Scientific methodology and model equations
  DATA_SOURCES.md   Real data sources and how each is used
  DEMO_SCRIPT.md    Five-minute demonstration script for judges
public/
scripts/
  check-data.ts     Developer sanity check for the data pipeline
```

The data layer (`src/data`, `src/lib`) has no React dependency and can be unit-tested or reused independently.

---

## Scientific honesty

- Every crew value, event, alert and simulator curve is **simulated**. The UI marks this on every page.
- Magnitudes in the generator and simulator are **informed by** published spaceflight research (MSL/RAD radiation measurements, ISS sleep actigraphy, bone and muscle studies, NASA-STD-3001 exposure limits). See `docs/METHODOLOGY.md` and `docs/DATA_SOURCES.md`.
- Anomalies are statistical deviations from a crew member's own baseline. **They are not diagnoses.**
- The reference bands on the self-assessment page are **general adult reference values used to drive a demonstration**. They are not clinical thresholds, they are not personalised, and no action text recommends a treatment — every escalation routes to the flight surgeon. This is stated in `src/data/selfcheck.ts` and on the page itself.
- Points, streaks and patches are an **engagement score for a simulation**, not a health score.
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

## Constellation Engine and Signal Veil

Two additions sit alongside the main application and do not change its navigation or layout.

**Constellation Engine** (`src/engine/`) is a standalone statistical library: robust personal baselines, EWMA deviation tracking, a multivariate EWMA statistic that detects several modest shifts happening together, relationship tests with detrending and multiplicity correction, before/after tracking around recorded protocol actions, and structured explanations. It has no React or DOM dependency. See `docs/CONSTELLATION_ENGINE.md`.

**Signal Veil** (`src/features/signal-veil/`) is a first-person visualization. You look out through a fogged helmet visor, wipe it clear, and explore a constellation of health signals driven by the engine. The fog is a procedural WebGL2 shader with a Canvas 2D fallback. See `docs/SIGNAL_VEIL.md`, which includes integration instructions.

```bash
npm run dev            # then open http://localhost:5173/signal-veil.html
npm test               # 136 tests: engine statistics and visualization logic
npm run check:engine   # prints what the engine finds in the demonstration mission
```

The demonstration is a deterministic, fictional 150-day mission. Every measurement is synthetic.

| Document | Contents |
|---|---|
| `docs/SIGNAL_VEIL.md` | Interaction, rendering techniques, integration instructions, limitations |
| `docs/CONSTELLATION_ENGINE.md` | Statistical methodology and verification |
| `docs/COMPETITIVE_RESEARCH.md` | What was examined, what could not be accessed, and how AURORA differs |
| `docs/NASA_DATA.md` | NASA resources consulted and the real-versus-synthetic boundary |

---

## License

MIT. Fictional mission and crew; no real person is depicted.
