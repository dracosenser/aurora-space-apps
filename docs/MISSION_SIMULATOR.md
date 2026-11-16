# AURORA Mission Simulator

An exploratory, reproducible simulation of astronaut health indicators across a user-defined mission. **Every value it produces is simulated.** It is not astronaut telemetry, it does not diagnose or predict medical conditions, and a difference between two scenarios is not evidence that a real intervention would have the same effect.

Pages: **Mission Builder** (`#/missions`) and **Medical Monitor** (`#/medical`). Code: `src/sim/` (pure TypeScript, no React except two hooks), `src/features/missions/`, `src/pages/MissionBuilder.tsx`, `src/pages/MedicalMonitor.tsx`.

## Workflow

1. **Missions**: create, open, duplicate, make a scenario copy, delete, load a mission file, add example missions.
2. **Mission**: name, identifier, destination, description, start date, duration (any length; presets 30/90/150/365), resolution (daily or hourly), random seed, spacecraft.
3. **Crew**: add, remove, edit and duplicate astronauts; choose who takes part. Each has identity, mission profile (sleep start and length, work hours, workload, exercise sessions/minutes/hour) and health baseline (resting HR, HRV, respiratory rate, SpO₂, body temperature, typical sleep, activity, variability).
4. **Spacecraft conditions**: eleven parameters, each with value, unit, description, reference range and its source (or "no reference"), an out-of-range flag, and a line saying how the model uses it.
5. **Events**: thirteen event types; start day, duration, whole crew or chosen astronauts, parameters, and environmental overrides.
6. **Review & run**: validation errors and warnings, reset configuration, run.
7. **Results**: mission overview, timeline you can scrub, crew comparison chart and table, alerts with explanations, individual astronaut view (with hourly profile at hourly resolution), cabin environment charts, CSV export of every value, mission export.
8. **Compare scenarios**: A vs B with input differences, output differences per astronaut and indicator, and the modeled effects that carry each change.

Missions are saved automatically in the browser (`localStorage`, key `aurora.missions.v1`). Results are not stored because they do not need to be: the same configuration and seed always reproduce exactly the same results.

## Limits

| Setting | Limit | Why |
|---|---|---|
| Participating astronauts | 30 per simulation | Keeps detection responsive in the browser. Any number can be on the roster. |
| Duration, daily | 1,100 days | |
| Duration, hourly | 365 days | Hourly output is 120 values per astronaut per day. |
| Detection | needs ≈ 21 days | Personal baselines need about three weeks of data. Shorter missions still run. |

Measured: a 150-day, 4-person mission simulates in about 35 ms in the browser; a 1,000-day, 12-person mission runs inside the 3-second test budget.

## The model

Each astronaut is simulated day by day from their own baseline. An event never applies a "health penalty": it changes model **inputs** (sleep opportunity, workload, stress, exercise availability, EVA hours, dose, cabin conditions), and the health indicators respond only through the documented effects below. Every effect's contribution to every indicator on every day is recorded, which is what makes alerts and scenario differences explainable.

**Reproducibility.** Random variation comes from a seed derived from the mission seed and the astronaut's id, so adding, removing or editing one astronaut never changes another's numbers, and a scenario copy (same seed, same ids) differs only where its inputs differ.

### Effects

`established` = physiology or accounting with a sound basis. `simplified` = an experimental assumption whose direction is supported but whose size is illustrative.

| Effect | Equation | Basis |
|---|---|---|
| Oxygen supply sets saturation | PIO₂ = ppO₂·(Pb−47)/Pb; PAO₂ = PIO₂ − 40/0.8; PaO₂ = PAO₂ − 10; SpO₂ by Severinghaus (1979); applied as a change from sea-level air | established (see limitation) |
| Lower saturation raises HR | +0.5 bpm per % below reference | simplified |
| Sleep cannot exceed opportunity | sleep = min(0.95 × opportunity, typical sleep) × efficiency | established |
| Noise reduces sleep | efficiency −0.6 %/dBA above 50 | simplified |
| CO₂ reduces sleep quality | efficiency −1.5 %/mmHg and quality −3/mmHg above 3 mmHg | simplified |
| Cabin temperature reduces sleep | efficiency −1 %/°C outside 18–27 °C | simplified |
| Schedule shift reduces sleep | efficiency −4 %/h of misalignment; re-entrains 1 h/day | simplified |
| Stress reduces sleep quality | −2 points per stress point above 3 | simplified |
| Sleep debt affects HR and HRV | debt = 3-day EWMA of shortfall; HR +1.2 bpm/h, HRV −4 ms/h | simplified |
| Deconditioning | HR → baseline + 8·(1 − exercise fraction)·(1 − g), τ = 21 d; HRV −1.25 ms per bpm | simplified |
| CO₂ raises breathing rate | +0.25 /min per mmHg above 3 | simplified |
| Cabin temperature nudges body temperature | ±0.05 °C per °C outside 18–27 °C | simplified |
| Stress affects HR and HRV | HR +0.8 bpm, HRV −2 ms per point above 3 | simplified |
| Workload sets stress | stress = 1 + 0.6·workload + event stress + 0.5·debt | simplified |
| Fatigue | 1.5 + 0.9·debt + 0.35·stress + 0.2·workload + EVA h/6 | simplified |
| Activity accounting | baseline + (exercise − nominal exercise) + EVA h × 60 | established (identity) |
| Dose accounting | background + SPE dose ÷ duration + EVA h × hourly rate × (multiplier − 1) | established (identity) |
| Individual variation | AR(1) noise, φ = 0.3, scaled by the astronaut's variability | simplified |

Exercise fraction = scheduled exercise minutes per day ÷ 60, capped at 1 (an assumption: 60 min/day is treated as the full countermeasure).

Variables recorded but **not** used by any effect, because no defensible relationship was implemented: humidity, lighting level (schedule shifts act through events), vibration, airborne particulates, habitable volume. Changing them changes no health output; a test checks this.

**Hourly resolution** renders each modeled day with documented daily shapes: heart rate lower asleep (×0.93) and higher awake (×1.1), raised during exercise and EVA; core temperature following a ±0.35 °C circadian rhythm peaking in the late afternoon. Detection always runs on daily values.

**Indicators.** Measurable on a real mission: resting HR, HRV, respiratory rate, SpO₂, body temperature, sleep duration, activity, daily dose. Modeled estimates with no direct sensor (marked * in the UI): sleep quality, workload, stress, fatigue.

## Readiness assessment

`src/sim/assess.ts` turns a simulated run into a 0–100 readiness score per astronaut per day. It replaces the earlier composite, which compared each person only with their own baseline and was capped by noisy alerts: a person entered as needing 3 h of sleep was treated as rested, and scores jumped whenever an alert opened or closed.

**Sleep is modeled against need, not habit.** Each astronaut has a *usual sleep* (what they actually sleep, the field the builder used to call "typical sleep") and a *sleep need* (default 8 h; adults need 7–9 h, Watson et al., *Sleep* 2015). Each night adds (need − sleep) hours to a cumulative sleep debt that decays with a 21-day time constant. Following Van Dongen et al. (*Sleep* 2003), 30 h of debt impairs performance about as much as one night without sleep, and expected reaction-test (PVT) lapses rise from about 2 per 10-minute test when rested to about 8.5 per night-equivalent of debt, without levelling off. Self-rated sleepiness levels off while lapses keep rising, so the assessment tells controllers to judge alertness by the reaction test. Sleep debt also raises resting heart rate, lowers HRV and mood, and raises fatigue and stress. Two new simulated indicators carry this: `sleepDebt` (h) and `pvtLapses`.

**Score.** Five areas, each scored 0–100 by subtracting points for findings computed from 7-day means or cumulative states:

| Area | Weight | Points lost for |
|---|---|---|
| Sleep and alertness | 30 % | sleep debt (40 per night-equivalent), sleep quality below 70, consistency below 75 |
| Behavioral health | 20 % | fatigue above 3.5, stress above 4.5, mood below 6 |
| Muscle and bone | 20 % | exercise below 60 min/day in reduced gravity, strength loss beyond 2 %, bone loss beyond 0.5 % |
| Cardiopulmonary | 15 % | resting HR beyond +2 bpm of baseline, HRV drop beyond 8 %, blood-pressure stage 1/2 (2017 ACC/AHA), SpO₂ below 95 % |
| Cabin and radiation exposure | 15 % | each cabin parameter outside its reference range; radiation as a share of the 600 mSv career limit (NASA-STD-3001 Vol. 1 Rev. B) |

The score is the weighted mean, held to at most the weakest area + 30 so one severe deficit cannot be averaged away. Status: ≥ 80 nominal, 65–79 watch, < 65 caution. The weights and point slopes are AURORA's operational choices for ranking attention, not a validated clinical instrument.

**Weaknesses and recommendations.** Each finding lists its evidence against the reference, the model effects that caused it (summed from the run's per-effect contributions), a lagged correlation from the astronaut's own data when |r| ≥ 0.3 over at least 14 day pairs, and a recommendation chosen from the dominant cause: extend the sleep period, treat short habitual sleep as a medical-operations issue, add recovery sleep after disruptive events, restore countermeasure exercise, lighten workload, or bring a cabin parameter back to nominal. Each recommendation that can be expressed as a mission change is tested by re-running that astronaut's simulation with it (from tomorrow when there is time left, otherwise from mission start) and reporting the readiness it produces.

The Medical Monitor shows the full assessment; Mission Control, crew cards, profiles, reports and the assistant use its score and weakest areas.

## Detection and explanation

Each astronaut's simulated daily series, with the varying cabin conditions as context, is analysed by the unchanged Constellation Engine (`docs/CONSTELLATION_ENGINE.md`): robust personal baselines, EWMA deviation tracking, and the multivariate joint statistic. Alerts use deliberately non-diagnostic language:

| Level | Source |
|---|---|
| Pattern requiring investigation | A joint multivariable pattern |
| Unusual trend | A sustained single-indicator deviation |
| Monitoring alert | A brief single-indicator deviation |

Every alert shows the indicators, baseline versus recent values, when it started, the coinciding mission events, the modeled effects acting on those indicators in that window (each labelled established or simplified, with its source), and a confidence statement. Coinciding with an event is never presented as proof of cause.

## Scientific sources

- Alveolar gas equation; Severinghaus JW, *J Appl Physiol* 46:599, 1979 (oxygen dissociation).
- NASA-STD-3001 Vol. 2: cabin temperature 18–27 °C (65–80 °F) and relative humidity 25–75 %. Vol. 1: 600 mSv career effective-dose limit. Verify against the current revision.
- Law J et al., *J Occup Environ Med* 56:477, 2014: ISS CO₂ and headache. Used for the 3 mmHg reference point, which is **not** a regulatory limit.
- Zeitlin C et al., *Science* 340:1080, 2013: ≈1.8 mSv/day in Earth–Mars cruise.
- Barger LK et al., *Lancet Neurol* 13:904, 2014: sleep in spaceflight.
- Flynn-Evans EE et al., *npj Microgravity* 2:15019, 2016: circadian misalignment and sleep in spaceflight.
- WHO Environmental Noise Guidelines, 2018; Okamoto-Mizuno K & Mizuno K, *J Physiol Anthropol* 31:14, 2012 (thermal environment and sleep).
- NASA Human Research Program, Risk of Cardiovascular Adaptations.

Reference ranges with no confirmed authoritative source (oxygen partial pressure band, noise, lighting) are labelled **demo setting** in the interface.

## Known limitations

- The oxygen model holds arterial CO₂ at 40 mmHg, so it does not include the extra breathing that partly compensates for low oxygen. It **overstates** desaturation at low oxygen (for example ≈ 88 % for air at 2,000 m, where real values are typically 93–95 %).
- Effect sizes marked simplified are illustrative and uncalibrated.
- No sex, age, illness, medication, nutrition or individual differences in sensitivity beyond baseline and variability.
- Cabin conditions are shared. An environmental event aimed at specific astronauts changes their simulated environment but not the shared cabin chart.
- Results are not persisted; they are recomputed from the saved configuration.

## Launching: the built mission drives all of AURORA

The app now opens on the Mission Builder. **Run and launch** makes the mission the source of truth for every page, replacing the fixed Ares Meridiani demonstration:

| Page | What it now shows |
|---|---|
| Mission Control, top bar, mission timeline, reports | The launched mission's name, identifier, destination, duration, crew and events |
| Crew Health Analytics, Early Warning, Mission Assistant | Daily records derived from the launched mission's simulation |
| Signal Veil | The launched crew; each astronaut's simulated signals and the same Constellation Engine analysis the Medical Monitor uses |
| Medical Monitor | The launched mission (switching mission there launches it) |
| Flight Deck consoles | Mission, crew and events; the environmental console shows the simulated cabin conditions for the selected day (the 3D scene is unchanged) |

How it works (`src/sim/launch.ts`): launching stores a snapshot of the mission, simulates it, replaces the contents of the shared crew, mission, phase and event objects in `src/data`, derives each `DailyRecord` from the simulation, and remounts the app once. Editing in the builder does not disturb other pages until the mission is run again; the builder marks a mission as *launched*, *edited since launch* or *not launched*.

To give the existing pages every indicator they show, the simulator also produces systolic and diastolic blood pressure (baseline plus variation only; no modeled effect), logged exercise, a muscle strength index and a bone health indicator (simplified deconditioning models informed by Trappe et al. 2009 and Stavnichuk et al. 2020), a mood index (simplified) and sleep consistency (derived from the last 7 nights).

For missions shorter than about 45 days, the original rule-based Early Warning page has too little history to fire; the Constellation Engine (Signal Veil, Medical Monitor, Mission Builder results) needs about three weeks.

## Spacecraft integration contract

The simulation is the source of truth. The 3D Flight Deck was **not modified**. It can consume the active mission through `src/sim/runtime.ts`:

```ts
import { spacecraftFeed, useActiveSimulation } from './sim/runtime'

// Plain data for any renderer (no React needed):
const feed = spacecraftFeed(day) // day optional, defaults to the last mission day
// feed.mission     { id, name, code, destination, durationDays, day, progress, startDate } → navigation console
// feed.environment [{ key, value }] for that day                                      → environmental control
// feed.crew        [{ id, name, role, current: { restingHR, spo2, … }, alerts }]       → medical bay
// feed.alerts      [{ astronautId, level, title, startDay, active }]                   → medical alerts
// feed.events      [{ title, startDay, endDay, active }]                               → communications

// In a React console component:
const { config, result, error } = useActiveSimulation() // re-renders when the active mission changes
```

`missionLibrary.setActive(id)` changes the active mission everywhere. The Medical Monitor page is the reference consumer: select an astronaut, then see baseline comparison, trends, alerts, events, Constellation Engine findings, notes, and Signal Veil on that astronaut's data. The flight-deck consoles currently show their own fixed values; wiring them to `spacecraftFeed` is a small change inside the console DOM components (`src/features/flight-deck/ui/StationPanels.tsx`) for the teammate who owns them.

## Tests

`npm test` runs 28 simulator tests (`src/sim/__tests__/sim.test.ts`): crew sizes 1–30, identity and per-astronaut correctness, adding or editing one astronaut not changing another, duration 1–365 days, hourly output and circadian shape, resolution limits, reproducibility, the oxygen equation, documented-effects-only behaviour, unused variables having no effect, gravity × exercise deconditioning, event timing and targeting, sleep-debt recovery, dose accounting, environmental anomalies, validation warnings, detection with explanations, scenario comparison and attribution, and example missions.
