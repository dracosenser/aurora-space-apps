# Competitive Research and Differentiation

Research was carried out on 14 November 2026. This note records what could be verified and what could not. Nothing here is copied from another project.

## What was examined

| Source | Result |
|---|---|
| NASA's announcement of the 2025 Space Apps Global Winners | Read |
| SpaceGenes+ (2025 Best Use of Science) project write-up | Read |
| ANCHOR at `github.com/AGCpr/ncaer` | **Not accessible.** The URL returned HTTP 404, and a web search found no project by that name. No claim is made about its contents. |
| Other public 2026 projects for "Create Health Monitoring Software for Astronauts on Space Missions" | **None found** by web search. Results were Space Apps entries from 2014–2022 and unrelated health-monitoring work. |

Sources: <https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/>, <https://www.crafterwiki.com/projects/spacegenes-plus/>.

## What the 2025 winners suggest

- **SpaceGenes+** (Best Use of Science) was a one-person dashboard on a single named NASA dataset (OSD-288). Its method was an explicit, checkable rule: flag genes whose response to radiation and microgravity together exceeds the sum of the separate responses. The organizers praised an easy way to identify important changes. The lesson: a narrow, transparent, verifiable method beat breadth, and the core idea was *interaction between factors*, not factors one at a time.
- **PureFlow** (Best Mission Concept) paired 3D habitat modelling with testing against space-weather threats: an interactive tool where the user changes something and sees a consequence.
- **Astro Sweepers**, **Resonant Exoplanets** and **Twisters** each ingest public data automatically and reduce it to an assessment a non-specialist can act on.
- **HerCode Space** and **Zumorroda-X** won on storytelling and play.

Across categories, winners combined a clear method with an experience that is immediate to grasp.

## What appears common in astronaut-health entries

Judging from the older public entries that search returned (2014, 2015, 2022), the recurring pattern is a dashboard of sensor telemetry with threshold alerts, sometimes with an AI model for detection. Personal baselines and anomaly flags are a natural next step and should be assumed common in 2026, although this could not be confirmed from 2026 projects.

## How AURORA differs

1. **Cross-indicator intelligence.** The joint statistic detects several modest, simultaneous shifts that no single-indicator alarm reports. In the demonstration there is a day on which all ten indicators are individually "normal" while a six-indicator pattern has been sustained for two weeks.
2. **Evidence-backed relationships with true negatives.** Relationships are tested with detrending, autocorrelation-adjusted sample sizes and two multiplicity corrections. The demonstration includes pairs that changed during the same weeks and are correctly reported as *not* related.
3. **Countermeasure response tracking.** A structured before/after comparison around a recorded action, with confounding context, that refuses to claim cause.
4. **A first-person interaction.** You wipe your own fogged visor to uncover the data. The fog is a procedural shader, and every animation behind it is bound to an engine result.
5. **One scientific story.** A deterministic 150-day mission in which the visual experience and the computation are the same thing: replay shows the pattern forming from the recorded observations.
6. **Stated limits.** Evidence strength is graded in words, never as a confidence percentage, and synthetic, computed and user-entered values are labelled separately.

## Caveat

Because no 2026 entries could be examined, the comparison with current competitors is an inference from past years, not an observation.
