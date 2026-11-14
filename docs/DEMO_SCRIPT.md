# AURORA — Five-Minute Demonstration Script

Audience: NASA Space Apps judges. Setup: `npm run dev`, open the app in a desktop browser, dark theme, press **Reset** in the top bar beforehand so the guided tour appears fresh (close it, or use it as the walkthrough).

---

### 0:00 — Hook (Presentation page, 30 s)

> "On a Mars mission the crew is up to 40 light-minutes from the nearest flight surgeon and years from evacuation. Their health data already exists: wearables, actigraphy, exercise logs, dosimeters, daily check-ins. What is missing is a system that integrates those signals, explains what is changing and lets the crew reason about what comes next. That is AURORA. Because every explorer matters. Every signal counts."

Click **Open the live demo**.

### 0:30 — Mission Control (60 s)

- Point to the top bar: mission day 412 of 900, surface operations, mission elapsed time, LIVE indicator.
- KPI row: crew composite 90, five active alerts, cumulative dose at 82% of the career limit after 412 days — "radiation is already the mission's long-term constraint."
- Crew cards: three nominal, **Ferreira in caution** with resting HR, exercise and fatigue sparklines. Click Ferreira to open the profile, show 30-day sparklines per category and the alert list, close.
- Mission timeline: hover the treadmill fault (MD 388) and water-recycler repairs (MD 395). "Keep these two events in mind."
- Note the **Simulated data** tag: "Every crew value is synthetic and labelled. Every source is real."

### 1:30 — Historical playback (30 s)

- Drag the playback slider back to about MD 345. The alert badge, crew scores and timeline recompute. Show Holt's stress/mood alert during the conjunction blackout.
- "The system only ever uses what it would have known on that day. There is no hindsight in the detection."
- Click **Live** to return.

### 2:00 — Early Warning Intelligence (60 s)

- Open the top alert: *Ferreira: 5 indicators moved together*. Walk the structure: **what changed** (numbers, z-scores), **when**, **indicators**, **why the rule fired**, **confidence rationale**, **what to review**, and the indicator trace with the alert window shaded.
- "No black box. Each rule is a sentence a flight surgeon can read, and the numbers that triggered it are on screen."
- Scroll the right column: rule catalogue and the anomaly-vs-diagnosis distinction. "AURORA raises statistical anomalies. It never diagnoses."

### 3:00 — Crew Health Analytics (40 s)

- Select Ferreira, Cardiovascular, 90 days: resting HR and HRV charts with the alert band and event markers for the treadmill fault.
- Switch to **Compare crew**, Physical category: exercise minutes diverge for Ferreira after MD 390 while the others hold.
- Mention date-range presets, custom ranges, the 7-day mean overlay, and the historical trend table.

### 3:40 — What-If Simulator (50 s)

- Preset **Exercise hardware failure**: muscle strength falls from 94% to 76%, bone indicator drops, readiness falls 34 points; operational considerations appear automatically.
- Drag **Exercise frequency** from 2 back to 6 and watch the curves recover live. Then set the radiation scenario to **Three solar particle events** and point to cumulative dose crossing the 600 mSv line and the generated consideration.
- Read the assumptions card: "Illustrative models with explicit assumptions, not predictions."

### 4:30 — Mission Assistant (30 s)

- Click **Explain the latest warning**, then **Which astronaut has experienced the largest change in sleep consistency?** (Arakawa, the repair shifts).
- Expand **Show reasoning, facts & hypotheses**. "It answers only from the data in the app, shows its work, and says when it cannot answer. No external AI service."

### 5:00 — Close (Sources & Science, 20 s)

- Scroll the source catalogue: HRP, OSDR, MSL/RAD papers, NASA-STD-3001, sleep and bone studies, each with representation and limitations.
- "AURORA is built to be honest about what is real, what is simulated and what is uncertain, because that is what a crew would need to trust it. Thank you."

---

### Backup questions

- **Why rules instead of machine learning?** Explainability and auditability for a safety-critical, data-sparse domain. The architecture keeps an explanation layer so statistical change-point or multivariate methods can be added without losing it.
- **Where would real data come from?** De-identified research data via OSDR and LSDA for calibration; on a mission, from the crew's own instruments under crew-controlled privacy.
- **What would you validate first?** The alert thresholds against longitudinal analog and ISS data, then the simulator's muscle and bone responses with uncertainty bands.
- **Is the radiation projection real?** The dose rates are from published MSL/RAD measurements; the projection is a simple integration and is labelled as such. A Mars round trip approaching or exceeding 600 mSv is consistent with published estimates, which is exactly why shielding and transit time dominate mission design.
