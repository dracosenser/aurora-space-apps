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

The page lists 17 risks, read in full on 15 November 2026:

- **Human physiology (11):** Altered Immune System Responses; Altered Sensorimotor and Vestibular Function; Cardiovascular Adaptations; Decompression Sickness; Host-Microorganism Interactions; Hypoxia; Inadequate Food and Nutrition; Injury and Compromised Performance from Spacewalks; Reduced Cardiorespiratory and Musculoskeletal Fitness; Spaceflight Associated Neuro-ocular Syndrome (SANS); Spaceflight-Induced Bone Changes
- **Behavioral performance and human factors (5):** Behavioral Changes and Psychiatric Disorders; Inadequate Teamwork; Inadequate Sleep and Irregular Schedules; Inadequate Systems Operations Support; Injury from Dynamic Loads
- **Space radiation (1):** Radiation-Induced Cancers

These are names of risks NASA studies. They are not diagnoses, and AURORA never asserts a crew member has one.

Risks the demonstration's categories correspond to:

| SIGNAL VEIL category | HRP risk |
|---|---|
| Cardiovascular | Risk of Cardiovascular Adaptations |
| Sleep | Risk of Inadequate Sleep and Irregular Schedules |
| Fatigue and behavioral | Risk of Behavioral Changes and Psychiatric Disorders |
| Physical activity | Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness |

The page lists no separate cognition risk; reaction-time testing is included here because cognitive performance is a recognised concern within behavioral health and sleep research. How it is used: choice of categories and vocabulary only. No numeric value is taken from it.

The five body systems on the Self-Assessment page (`src/data/bodySystems.ts`) map to the same list:

| Body system | HRP risks |
|---|---|
| Cardiovascular | Cardiovascular Adaptations; Reduced Cardiorespiratory and Musculoskeletal Fitness |
| Neurobehavioral | Behavioral Changes and Psychiatric Disorders; Inadequate Sleep and Irregular Schedules |
| Sensory | Spaceflight Associated Neuro-ocular Syndrome (SANS); Altered Sensorimotor and Vestibular Function |
| Immune | Altered Immune System Responses; Host-Microorganism Interactions |
| Musculoskeletal | Spaceflight-Induced Bone Changes; Reduced Cardiorespiratory and Musculoskeletal Fitness |

### NASA Open Science Data Repository (OSDR)

<https://osdr.nasa.gov/>

OSDR hosts open spaceflight biological and physiological data, is species-agnostic, and includes data from the commercial astronauts of the SpaceX Inspiration4 mission. Data is programmatically accessible through GLOpenAPI (<https://visualization.genelab.nasa.gov/GLOpenAPI/>).

Repository reference: *NASA open science data repository: open science for life in space*, Nucleic Acids Research 53(D1), D1697 — <https://academic.oup.com/nar/article/53/D1/D1697/7903386>

**Specific accessions, confirmed 15 November 2026.** An earlier pass recorded that no accession could be confirmed. These now can be:

| Accession | Contents | Link |
|---|---|---|
| **OSD-569** | Whole Blood Measurements from the SpaceX Inspiration4 Mission: RNA-seq, epitranscriptome, WGS, clonal hematopoiesis, **CBC**. GeneLab GLDS-561, ALSDA LSDS-7, DOI 10.26030/e0rx-sh52 | <https://osdr.nasa.gov/bio/repo/data/studies/OSD-569> |
| **OSD-575** | Blood serum, same mission and crew — metabolic panel | <https://osdr.nasa.gov/bio/repo/data/studies/OSD-575> |
| **OSD-574** | Skin biopsy, same mission | <https://osdr.nasa.gov/bio/repo/data/studies/OSD-574> |

These sit in the Space Omics and Medical Atlas (SOMA) family with OSD-570, -571, -572, -573, -630, -656 and -687. Reference: *Inspiration4 data access through the NASA Open Science Data Repository*, npj Microgravity 2024 — <https://www.nature.com/articles/s41526-024-00393-5>

**Why none of it is embedded in AURORA.** Two reasons, both deciding:

1. **Access.** Raw data from whole blood, urine and skin biopsies, collected before, during and after spaceflight, is under controlled access and must be formally requested. Requesting, receiving and then redistributing crew biospecimen data inside a hackathon demonstration is not appropriate, and would blur exactly the provenance line this document exists to keep sharp.
2. **Shape.** The Inspiration4 corpus is four civilian astronauts on a three-day free-flyer mission, sampled at a handful of timepoints. The Constellation Engine needs daily or near-daily series over months. **No openly downloadable, per-astronaut, daily time series covering sleep, heart rate, cognition and self-report together was identified.** That dataset does not appear to exist publicly.

So these accessions are cited as the evidence that the indicator families AURORA models — complete blood count and immune markers, metabolic panels — are real flight-relevant measurements, and **every value the application displays is generated.** Forcing an unrelated dataset into a crew-monitoring demonstration would have been misleading.

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
