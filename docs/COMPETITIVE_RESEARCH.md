# Competitive Research and Differentiation

Research was carried out on 14 November 2026. This note records what could be verified and what could not. Nothing here is copied from another project.

## What was examined

| Source | Result |
|---|---|
| NASA's announcement of the 2025 Space Apps Global Winners | Read |
| SpaceGenes+ (2025 Best Use of Science) project write-up | Read |
| ANCHOR at `github.com/AGCpr/ncaer` | **Not accessible.** The URL returned HTTP 404, and a web search found no project by that name. No claim is made about its contents. |
| Other public 2026 projects for "Create Health Monitoring Software for Astronauts on Space Missions" | **Ten found and read on 15 November 2026.** See "The 2026 field" below. An earlier pass on 14 November found none; the search that worked used project-shaped terms rather than the challenge title. |

Sources: <https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/>, <https://www.crafterwiki.com/projects/spacegenes-plus/>.

## What the 2025 winners suggest

- **SpaceGenes+** (Best Use of Science) was a one-person dashboard on a single named NASA dataset (OSD-288). Its method was an explicit, checkable rule: flag genes whose response to radiation and microgravity together exceeds the sum of the separate responses. The organizers praised an easy way to identify important changes. The lesson: a narrow, transparent, verifiable method beat breadth, and the core idea was *interaction between factors*, not factors one at a time.
- **PureFlow** (Best Mission Concept) paired 3D habitat modelling with testing against space-weather threats: an interactive tool where the user changes something and sees a consequence.
- **Astro Sweepers**, **Resonant Exoplanets** and **Twisters** each ingest public data automatically and reduce it to an assessment a non-specialist can act on.
- **HerCode Space** and **Zumorroda-X** won on storytelling and play.

Across categories, winners combined a clear method with an experience that is immediate to grasp.

## The 2026 field

Read on GitHub, 15 November 2026. These are the projects AURORA is judged beside.

| Project | Approach |
|---|---|
| [VITA](https://github.com/Nav33dCodes/vita-astronaut-health-monitor) | .NET 10 / Next.js 16 / PostgreSQL / SignalR. A bedside-monitor view of every crew member streamed over SignalR; reference ranges described as loosely based on NASA-STD-3001, and an early-warning score adapted from NEWS2 (Royal College of Physicians). ETag/304, Brotli, output caching, offline-tolerant client cache, hourly rollups |
| [Horizon](https://github.com/EishaTahir-code/astronaut-health-prac) | Seven self-entered readings, each with a how-to guide and an instant green/amber/red result, then a symptom check, action cards and a one-tap report to the flight surgeon. A clickable body figure where each region shows what it does, your status, what spaceflight does to it and what helps. Streaks and badges. A photoreal Earth hero |
| [Astronaut Self-Assessment Panel](https://github.com/mustafadmrkrn/nasaspaceappshealthmonitoring) | Daily check-in for 7 indicators compared against the user's **own** baseline (their first 7 readings), resolving to Usual / Watch / Attention / No data. Displays real OSDR data from OSD-575 descriptively. States plainly that differences between people are not a health judgment |
| [Crew Health Monitor](https://github.com/AdityaK0804/Crew-Health-Monitor) | A signals table marking every rule as *published* or *demo parameter*: hematocrit, optic nerve sheath, neck vein flow, headache with cabin CO₂, urine output, white cells (OSD-569 lab ranges), vitamin D, resistance exercise, radiation dose |
| [COSMOCare](https://github.com/omkargurav0216-code/COSMOCare) | Machine learning, anomaly detection, explainable risk assessment, AI health assistant |
| [AURA-EIMO](https://github.com/quirocode/aura-space-health-monitor) | React/TypeScript offline-first PWA, built to NASA-STD-3001 Vol. 2 (Displays & Controls) plus a dark-cockpit convention |
| [ASTROCARE](https://github.com/sachuabhijith3485-cpu/ASTROCARE) | Streamlit prototype: monitoring, ML, visualization, historical analysis |
| [aurora-astronaut-health](https://github.com/fabriciojunio/aurora-astronaut-health) | Unrelated project, same name. Career radiation dose against the NASA 600 mSv limit using real DOSTEL, CRaTER and Curiosity RAD measurements; 3-minute PVT-B vigilance test |

### The uncomfortable finding

**AURORA's self-assessment page is the commodity pattern of this challenge, not a differentiator.**

Horizon independently arrived at nearly our exact Self-Assessment page: seven to eight self-entered readings, how-to guidance, green/amber/red banding, action cards, escalation to the flight surgeon, a clickable body figure explaining each region, and streaks and badges. The Self-Assessment Panel independently arrived at our personal-baseline design. Several others ship anomaly detection with explanations.

A judge who reaches our Self-Assessment page will likely have seen that page already that day.

Three things in AURORA appear in **none** of the eight projects above:

1. **SIGNAL VEIL.** No other project has an uncovering interaction, a procedural fog shader, or drawing a connection as the act of querying an analysis.
2. **Joint multivariable evidence.** Others detect per-indicator anomalies. The Constellation Engine asks whether deviations overlap in time, persist, and are jointly unusual — and reports true negatives.
3. **Countermeasure response tracking.** A structured before/after comparison around a recorded action that refuses to claim cause. Nobody else does this.

### Where competitors are ahead of us

Both of these are fair criticisms and worth acting on:

- **Crew Health Monitor** labels every individual threshold as *published* or *demo parameter*, at the point of use. AURORA says "general adult reference values" once, in a source file.
- **VITA**, **AURA-EIMO**, **Crew Health Monitor** and the **Self-Assessment Panel** each anchor to a named standard or a specific OSDR accession. Until `docs/NASA_DATA.md` was revised on 15 November, AURORA cited no OSDR accession by identifier.

**Strategic conclusion:** lead with SIGNAL VEIL and the engine's evidence. Keep the self-assessment as the practical floor rather than the headline.

## How AURORA differs

1. **Cross-indicator intelligence.** The joint statistic detects several modest, simultaneous shifts that no single-indicator alarm reports. In the demonstration there is a day on which all ten indicators are individually "normal" while a six-indicator pattern has been sustained for two weeks.
2. **Evidence-backed relationships with true negatives.** Relationships are tested with detrending, autocorrelation-adjusted sample sizes and two multiplicity corrections. The demonstration includes pairs that changed during the same weeks and are correctly reported as *not* related.
3. **Countermeasure response tracking.** A structured before/after comparison around a recorded action, with confounding context, that refuses to claim cause.
4. **A first-person interaction.** You wipe your own fogged visor to uncover the data. The fog is a procedural shader, and every animation behind it is bound to an engine result.
5. **One scientific story.** A deterministic 150-day mission in which the visual experience and the computation are the same thing: replay shows the pattern forming from the recorded observations.
6. **Stated limits.** Evidence strength is graded in words, never as a confidence percentage, and synthetic, computed and user-entered values are labelled separately.

## Caveat

The 2026 comparison above is an observation of eight public repositories read on 15 November 2026, not of finished submissions. Those projects will change before judging, and the great majority of entries are not public at all — in 2025 there were more than 11,500 submissions, so any sample of eight is small. The claim that our self-assessment is a commodity pattern is well supported by what was read; the claim that nobody else has SIGNAL VEIL's interaction is supported only across those eight.

**ANCHOR** at `github.com/AGCpr/ncaer` was fetched again on 15 November 2026 and the host returned a client error. A targeted search did not surface the project elsewhere. It remains unassessed, and nothing in this document describes it.
