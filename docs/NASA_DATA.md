# NASA Scientific Foundation for the Constellation Engine and SIGNAL VEIL

This note records which NASA resources were consulted, what they support in the design, and where the line between real and synthetic data sits. It complements `docs/DATA_SOURCES.md`.

**No real astronaut measurement is used anywhere in AURORA.** No NASA partnership or endorsement exists or is implied.

## Five kinds of value, never mixed

The engine's data model tags every series and result with a provenance, and the interface shows it.

| Provenance | Meaning | Present in the demonstration |
|---|---|---|
| Synthetic demonstration data | Generated from a fixed seed for the demo | Yes: every measurement |
| Statistical estimate | Computed by the engine from other values | Yes: baselines, shifts, patterns, relationships, comparisons |
| User-entered | Typed in by the person using the app | Yes: actions recorded in the Response panel |
| Imported measurement | Loaded from a file or device export | Supported by the model; none loaded |
| NASA research data | Taken from a cited NASA dataset | Supported by the model; none loaded |

## NASA resources consulted (14 November 2026)

### NASA-STD-3001 Volume 1, section 3.0 Health and Medical Care

<https://www.nasa.gov/reference/3-0-health-and-medical-care/>

As summarised on that page, section 3.4 (In-Mission Preventive Health Care) calls for periodic monitoring of general health and of physiological and psychosocial well-being, including work/rest schedules and sleep and circadian rhythm, and for in-flight exercise. Section 3.5 (In-Mission Medical Care) includes assessing, recording and **trending** vital signs and behavioral-health signs.

How it is used: this is the requirement the Constellation Engine addresses directly. Trending against a personal baseline, across physiological and behavioral indicators together, is the engine's whole function. The response-tracking feature is framed around actions taken under approved protocols for the same reason.

### NASA Human Research Program risks

<https://www.nasa.gov/hrp/risks/>

Risks listed there that the demonstration's categories correspond to:

| SIGNAL VEIL category | HRP risk |
|---|---|
| Cardiovascular | Risk of Cardiovascular Adaptations |
| Sleep | Risk of Inadequate Sleep and Irregular Schedules |
| Fatigue and behavioral | Risk of Behavioral Changes and Psychiatric Disorders |
| Physical activity | Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness |

The page lists no separate cognition risk; reaction-time testing is included here because cognitive performance is a recognised concern within behavioral health and sleep research. How it is used: choice of categories and vocabulary only. No numeric value is taken from it.

### NASA Open Science Data Repository (OSDR)

<https://osdr.nasa.gov/>

OSDR hosts open spaceflight biological and physiological data. Search results indicated that human data ranges from open to mediated access, that OSDR added open-access human biological data from the Inspiration4 mission in 2024, and that sensor-level astronaut time series are generally subject to access controls.

**Finding: no openly downloadable, per-astronaut, daily time series covering sleep, heart rate, cognition and self-report together was identified.** A specific OSDR accession for such a dataset could not be confirmed, so none is cited. Forcing an unrelated dataset (for example rodent transcriptomics) into a crew-monitoring demonstration would have been misleading, so the demonstration is synthetic and says so.

### Human Research Roadmap

<https://humanresearchroadmap.nasa.gov/> — consulted for the evidence reports already listed in `docs/DATA_SOURCES.md`.

## Published findings that shaped the synthetic generator

These set orders of magnitude only. They are cited in `docs/DATA_SOURCES.md` with links and limitations.

| Generator feature | Informed by |
|---|---|
| Sleep near 6.9 h, falling by about half an hour under load | In-flight sleep averaging about 6 h on ISS and Shuttle (Barger et al., 2014) |
| Reaction-time test with skipped sessions | The self-administered psychomotor vigilance test used in spaceflight research |
| Slow decline in the weekly strength index | Muscle changes after long ISS missions (Trappe et al., 2009) |
| Sleep preceding next-day fatigue and reaction time | General sleep-research findings; planted as a known ground truth for the tests |

The planted couplings exist so the relationship tests have true positives and true negatives. They are not presented as findings about astronauts.

## If real data becomes available

A dataset needs, per indicator, a daily or periodic series with `null` for missing days, plus an `IndicatorDef` (unit, cadence, collection method, plausible range, resolution, provenance). `src/data/engineAdapters.ts` shows the pattern. For every real dataset, record its name, source, fields, measurement type, collection context, limitations and use, as in `docs/DATA_SOURCES.md`, and set its provenance to `nasa-research` or `imported`.
