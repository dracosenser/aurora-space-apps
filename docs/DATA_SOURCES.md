# AURORA — Real Data Sources and Scientific References

AURORA's demonstration crew data is synthetic. The resources below are the real NASA programs, repositories, standards and peer-reviewed studies that informed the design, the vocabulary and the numeric magnitudes used in the generator and simulator. None of them contains the values shown in the app.

| # | Source | Type | Link | What it represents | Used in AURORA for | Limitations |
|---|---|---|---|---|---|---|
| 1 | NASA Human Research Program | Program | https://www.nasa.gov/humans-in-space/human-research-program/ | NASA's program for human health and performance risks of spaceflight | Structure of the five health categories; framing | Not a dataset |
| 2 | NASA Human Research Roadmap & Evidence Reports | Research | https://humanresearchroadmap.nasa.gov/evidence/ | Peer-reviewed evidence summaries per human-system risk | Indicator choice; alert rationale text; limitations language | Periodically revised; magnitudes vary by mission |
| 3 | NASA Open Science Data Repository (OSDR) | Dataset | https://osdr.nasa.gov/bio/ | Open spaceflight biological and physiological data with APIs | Future integration target; plausible ranges | Mostly research-study data, not daily astronaut telemetry |
| 4 | NASA Life Sciences Data Archive (LSDA) | Dataset | https://lsda.jsc.nasa.gov/ | Archive of human spaceflight research data and documentation | Background for baseline ranges | Astronaut-level data requires a request process |
| 5 | Zeitlin et al., *Science* 2013 — Radiation in transit to Mars (MSL/RAD) | Research | https://doi.org/10.1126/science.1235989 | Measured GCR dose-equivalent rate ≈1.8 mSv/day during cruise | Transit dose rate in data model and simulator | Uncrewed spacecraft shielding; solar-cycle dependent |
| 6 | Hassler et al., *Science* 2014 — Mars surface radiation (MSL/RAD) | Research | https://doi.org/10.1126/science.1244797 | Measured surface dose-equivalent rate ≈0.6–0.7 mSv/day | Surface dose rate (reduced for assumed habitat shielding) | Single site and period |
| 7 | NASA-STD-3001 Vol. 1, Space Flight Human-System Standard | Standard | https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-1 | Crew health standards incl. 600 mSv career effective-dose limit | Operational thresholds in the simulator and assistant | Consult current revision |
| 8 | Barger et al., *Lancet Neurology* 2014 — Sleep deficiency in astronauts | Research | https://doi.org/10.1016/S1474-4422(14)70122-X | In-flight sleep averaging ≈6 h per night (actigraphy) | Sleep-duration baselines | Low-Earth-orbit missions; actigraphy estimates |
| 9 | Stavnichuk et al., *npj Microgravity* 2020 — Bone loss in space travelers | Research | https://doi.org/10.1038/s41526-020-0103-8 | Pooled BMD losses on the order of 1%/month, reduced by exercise | Bone-indicator loss rate | Heterogeneous studies |
| 10 | Trappe et al., *J Appl Physiol* 2009 — Muscle after six months on ISS | Research | https://doi.org/10.1152/japplphysiol.91578.2008 | Documented muscle volume and strength losses despite exercise | Muscle-strength trend magnitudes | Pre-ARED hardware era |
| 11 | Garrett-Bakelman et al., *Science* 2019 — The NASA Twins Study | Research | https://doi.org/10.1126/science.aau8650 | Integrated multi-system profile of a 340-day mission | Motivation for integrated multivariable monitoring | Single subject |
| 12 | NASA DONKI Space Weather Database (api.nasa.gov) | API | https://api.nasa.gov/ | Real solar flare, CME and SEP event listings | Optional live space-weather panel (DEMO_KEY, on demand) | Rate-limited; not spacecraft dose |

## How real and simulated content are separated in the app

- Every page with crew data carries a **Simulated data** tag; the Mission Control, Early Warning and Simulator pages carry additional explicit disclaimers.
- The **Sources & Science** page lists the resources above with description, representation, limitations and usage, and states that AURORA has no NASA partnership or endorsement.
- The **live space-weather panel** is the only real-time data in the application. It is fetched only when the user clicks, is labelled "real data", and shows a clear error state when the public key is rate-limited.

## Attribution note

Numbers quoted from the studies above are rounded, order-of-magnitude values used to make synthetic data plausible. They should not be cited from AURORA; cite the original papers.
