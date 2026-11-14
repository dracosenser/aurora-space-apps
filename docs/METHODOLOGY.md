# AURORA — Scientific Methodology

This document describes how AURORA's demonstration data, anomaly detection, health scoring and what-if simulator work, and where each design choice comes from. Everything below is reproducible from the source in `src/data` and `src/lib`.

**Scope statement.** AURORA is a demonstration prototype. All crew data is synthetic. Nothing in this document claims clinical validity.

---

## 1. Indicator model

AURORA tracks 15 daily indicators in five categories chosen to mirror the human-system risk areas of NASA's Human Research Program:

| Category | Indicators | Plausible source on a mission |
|---|---|---|
| Cardiovascular | Resting heart rate, HRV (RMSSD), systolic and diastolic BP | Wearable biosensor; weekly cuff measurement |
| Sleep | Duration, consistency score, quality index | Actigraphy and self-report |
| Physical | Exercise minutes, muscle-strength index, bone research indicator | Countermeasure hardware logs; periodic strength test; research-grade estimate |
| Radiation | Daily dose, cumulative dose | Personal dosimeter |
| Behavioral | Stress, mood, fatigue | Daily check-in questions plus reaction-time drift |

Each indicator has a declared "concerning direction" (higher, lower, or either) that the anomaly rules and the UI use consistently.

## 2. Synthetic data generation (`src/data/generator.ts`)

A seeded PRNG (mulberry32) produces one record per crew member per mission day, so the demo is identical on every machine.

Baselines and drift rates are informed by published findings:

- **Sleep**: in-flight sleep on ISS and Shuttle averaged about 6 hours per night (Barger et al., 2014). Crew baselines are 6.4–7.1 h with night-to-night noise (σ ≈ 0.55 h) and a small transit penalty.
- **Radiation**: MSL/RAD measured ≈1.8 mSv/day during Earth–Mars cruise (Zeitlin et al., 2013) and ≈0.6–0.7 mSv/day on the surface at Gale Crater (Hassler et al., 2014). AURORA uses 1.78 mSv/day in transit and 0.48 mSv/day on the surface, the latter assuming additional habitat shielding. Two solar particle events add discrete doses (≈13 mSv on MD 96–98, ≈3 mSv on MD 405–406).
- **Bone**: long-duration crews lose on the order of 1% per month in weight-bearing sites, reduced by resistive exercise (Stavnichuk et al., 2020). The generator applies a loss rate of 0.04%/day × (1 − g) × (1 − 0.7 × exercise effectiveness), giving ≈0.3–0.4% per month with countermeasures in microgravity and less at 0.38 g.
- **Muscle**: strength follows a first-order approach to an equilibrium set by gravity and exercise effectiveness (Trappe et al., 2009 documents multi-percent losses after six months despite exercise). With nominal exercise the equilibrium in microgravity is ≈94% of pre-flight.
- **Cardiovascular**: resting HR and HRV are modelled as individual baselines plus a mean-reverting random walk, a small microgravity offset, and coupling to sleep debt, stress and deconditioning.
- **Behavioral**: stress, mood and fatigue combine a mean-reverting mood drift, sleep coupling and phase effects.

### Injected scenarios

To demonstrate the detection logic the generator injects five deliberate patterns:

| Crew | Days | Pattern | Narrative |
|---|---|---|---|
| Arakawa (AUR-02) | 394–404 | Irregular, short sleep; fatigue and stress up | Night repair shifts on the water recycler |
| Ferreira (AUR-04) | 390–412 (ongoing) | Exercise −42%, resting HR +7.5 bpm, HRV −14 ms, fatigue +2.2, mood −1.1, strength −1.6 | Treadmill fault plus rover science priority |
| Holt (AUR-01) | 336–352 | Stress +3.1, mood −2.4, sleep quality −9 | Solar conjunction communications blackout |
| Diallo (AUR-03) | 300–308 | Sleep −1.1 h, mood −1.3, exercise −25% | Dust-storm confinement |
| Diallo (AUR-03) | 370–412 | Systolic +9 mmHg gradual creep | Slow research-indicator trend |

All crew share the two radiation events.

## 3. Anomaly detection (`src/lib/anomaly.ts`)

Design principles: personal baselines, transparent statistics, combination logic, confidence with rationale, and an explicit distinction between anomaly and diagnosis.

**Windows.** For each crew member and each day *d*, the *recent* window is days *d−6…d* (7 days) and the *baseline* window is the 30 days ending 7 days before the recent window. The gap prevents a developing shift from contaminating its own baseline.

**Core statistic.** z = (mean(recent) − mean(baseline)) / sd(baseline), signed so that positive means "in the concerning direction".

**Rules.**

| Rule | Trigger | Severity |
|---|---|---|
| Cardiovascular level shift | Resting HR z ≥ 2.2 and/or HRV z ≤ −2.2 | watch; caution if both and peak ≥ 2.5 σ |
| Sleep irregularity | 7-day SD of sleep duration ≥ 1.1 h, or consistency score ≥ 18 points below baseline | watch; caution if both and mean sleep < 6 h |
| Rising fatigue with declining exercise | 10-day fatigue trend ≥ +1.0 (or 7-day mean ≥ baseline + 1.2) AND exercise ≤ 78% of baseline | caution |
| Multiple indicators changing together | ≥ 3 of 8 core indicators each ≥ 1.5 σ in the concerning direction | caution |
| Stress and mood shift | Stress ≥ baseline + 1.8 AND mood ≤ baseline − 1.3 | watch; caution if stress ≥ 7 |
| Blood-pressure research trend | 28-day systolic slope ≥ +4.5 mmHg AND 7-day mean ≥ baseline + 3.5 | info |
| Radiation exposure event (crew-wide) | Crew-mean daily dose > 3 × trailing 30-day median | watch; caution if excess ≥ 5 mSv |

**Persistence and lifecycle.** A rule must fire on at least two consecutive days to produce an alert (single-day noise is suppressed). An alert stays open while the rule keeps firing and closes after five clear days. Alerts whose last firing is within two days of the current view day are *active*; others are *resolved*. Because detection is recomputed for whatever mission day the user selects, historical playback shows exactly what the system would have known on that day.

**Confidence.** Each rule computes a confidence in [0.35, 0.96] from (a) deviation magnitude beyond threshold, (b) number of independent indicators involved, and (c) persistence in days. The rationale is rendered in words next to the percentage. Radiation events get high confidence because dosimetry is a direct physical measurement.

**What the system is not.** Rules are tuned on the injected scenarios, not on real astronaut data. False positives on noise are expected and visible in the resolved history; this is deliberate so judges can see the trade-off rather than a curated output.

## 4. Status score (`src/lib/health.ts`)

An operational 0–100 prioritisation aid per crew member, computed from trailing 7-day means against pre-flight baselines: penalties for resting HR elevation, HRV depression, short or poor sleep, low sleep consistency, exercise shortfall, and elevated fatigue, stress or low mood. Active caution alerts cap the score at 72 and watch alerts at 84. Thresholds: ≥ 80 nominal, 65–79 watch, < 65 caution. The crew composite is the mean of individual scores. It has no clinical meaning.

## 5. Mission What-If Simulator (`src/lib/simulator.ts`)

An illustrative deterministic model stepped daily over the chosen mission duration, with the mission split 23% outbound transit (0 g), 56% surface (0.38 g) and 21% return transit (0 g).

Let E = min(sessions/6, 1.15) × 0.82 be exercise effectiveness, g the gravity fraction, D sleep disruption (0–100) and S stress (1–10).

- Muscle: M′ = 0.012 × (M_eq − M), where M_eq = 100 − 34 (1 − g)(1 − E)
- Bone: B′ = −0.04 (1 − g)(1 − 0.7E) per day; no in-mission recovery
- Sleep debt: L ← 0.98 L + 0.004 D; sleep quality Q = clamp(80 − 0.32 D − 1.4 (S − 4) − 0.6 L + 2[g>0], 25, 95)
- Resting HR = 57 + 0.11 (100 − M) + 0.07 (80 − Q) + 0.5 (S − 4) + 1.5[g = 0]
- Fatigue = clamp(3 + 0.045 (80 − Q) + 0.3 (S − 4) + 0.03 (100 − M), 1, 10)
- Radiation: 1.78 mSv/day transit, 0.48 mSv/day surface; × 1.3 at solar minimum, × 0.7 with enhanced shielding; the SPE-series scenario adds 10, 25 and 8 mSv events at 15%, 50% and 80% of the mission
- Readiness index = clamp(100 − 0.9 (100 − M) − 1.2 (100 − B) − 0.45 (80 − Q) − 3.5 (F − 3), 0, 100), a comparison composite with no clinical meaning

The baseline for comparison is the same duration with default parameters (15% disruption, 6 sessions/week, nominal radiation, stress 4). Operational considerations are generated from thresholds, including the 600 mSv career effective-dose limit in NASA-STD-3001.

Limitations are listed in the UI: no individual variability, no pharmacology or nutrition, linear responses, and no validation against longitudinal human data.

## 6. Mission Assistant (`src/lib/assistant.ts`)

A local intent-matching engine. Questions are matched by keyword patterns to analytical intents (sleep-consistency ranking, largest indicator changes over N days, explain latest alert, cardiovascular comparison, simulator assumptions, crew-member summary, radiation summary, mission status, category summaries, alert list, help). Each answer is computed from the current records, alerts, statuses and simulator parameters, and returns the text plus three labelled lists: reasoning steps, facts and hypotheses/caveats. Unmatched questions get an explicit "cannot answer from the loaded data" response rather than a fabricated one. No external language model is involved.

## 7. Reproducibility

`npx tsx scripts/check-data.ts` regenerates the dataset, runs detection and the simulator, and prints sample assistant answers. The seed is fixed in `src/data/generator.ts`.
