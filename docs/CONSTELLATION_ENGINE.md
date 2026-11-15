# The Constellation Engine — Statistical Methodology

The Constellation Engine (`src/engine/`) is AURORA's health-intelligence core. It is pure TypeScript with no dependency on React, the DOM or any rendering code, and it runs in Node (`npm test`, `npm run check:engine`).

Its defining capability: **identifying changes across several indicators that overlap in time, even when no single indicator looks concerning on its own**, and explaining exactly how it reached that conclusion.

Every threshold below is a statistical convention expressed in units of the person's own variability. None is a clinical cut-off, and all are configurable in `src/engine/config.ts`.

```ts
import { createMissionAnalysis } from './engine'
const analysis = createMissionAnalysis(dataset)        // baselines, deviations, joint patterns
analysis.stateAt('sleepDuration', 96)                  // one indicator on one day
analysis.patternsAt(96)                                // joint patterns as reported that day
analysis.relationshipBetween('sleepDuration', 'fatigue', 96)
analysis.responseFor(action, 142)                      // before/after a recorded action
analysis.insightsAt(96)                                // structured explanations
```

Every method uses only observations on or before the requested day, so a mission can be replayed exactly as the engine would have seen it.

---

## 1. Data model and quality

A dataset is a set of indicator definitions and one series per indicator, with `null` for days without an observation. Each indicator declares its sampling cadence, collection method, a physically plausible range and its instrument resolution. Not every measurement comes from a wearable, and cadences differ (daily, or weekly for a strength test).

Quality screening rejects non-finite values and readings outside the plausible range (a sensor glitch, such as a heart rate of 0). Rejected readings are recorded and excluded. Missing values are never imputed.

## 2. Personal baseline (`timeline.ts`)

For each indicator, from that person's own observations:

- **Centre**: median.
- **Scale**: 1.4826 × MAD (median absolute deviation), floored at the instrument resolution. This robust scale is barely moved by an outlier inside the baseline window, unlike the standard deviation (tested).
- Also reported: mean, SD, quartiles, range, count, completeness and lag-1 autocorrelation.

Two modes:

- **Reference** (default): a fixed early-mission window (first 40 days; longer for sparse indicators so they can gather their minimum observations). Before the window completes the baseline is *provisional* and never includes the current day's value.
- **Rolling**: a trailing 45-day window ending 10 days before the day assessed. Suited to long missions where expected adaptation would otherwise dominate.

Below the minimum number of observations (14 daily, 5 sparse) the indicator's status is **insufficient data** and no comparison is made. A baseline describes what was typical for this person; it is not a statement that those values were medically healthy.

## 3. Deviation of a single indicator

1. **Robust z**: (reading − median) ÷ robust scale.
2. **Smoothing**: an exponentially weighted moving average (EWMA, λ = 0.25) of robust z, with each reading winsorised at ±3.5 so one or two extreme readings cannot masquerade as a sustained shift.
3. **Control-limit units**: the EWMA divided by its expected standard deviation under baseline behaviour. That standard deviation is the textbook √(λ/(2−λ)), widened for the autocorrelation observed in the baseline, plus (π/2)/n for the sampling variance of the baseline median, so short or sparse baselines get wider limits.
4. **Trend**: Theil–Sen slope and Mann–Kendall test over the trailing 21 days.

Status, in order of precedence:

| Status | Rule |
|---|---|
| insufficient data | no usable baseline |
| stale | no observation within 3 days (or twice the cadence) |
| sustained | \|shift\| ≥ 3 on at least 5 consecutive observations |
| unusual | a single reading with \|robust z\| ≥ 3.5 (modified z-score convention), or a newly crossed limit without a trend |
| drifting | Mann–Kendall p < 0.01, total change ≥ 1 robust SD, in the direction of the shift |
| normal | none of the above |

## 4. Multivariable pattern detection (`joint.ts`)

The joint statistic is a **multivariate EWMA** (MEWMA; Lowry, Woodall, Champ & Rigdon, 1992). The vector of smoothed, standardised deviations **s** for all regularly sampled indicators is measured against the correlation structure **R** observed in the person's own baseline window:

T² = **s**ᵀ **R**⁻¹ **s**

**R** is shrunk 30% toward the identity for stability. Stale indicators are left out and the matrix for the remaining ones is used. The control limit is the chi-square quantile for a false-alarm rate of 0.1% per day.

A day is a *pattern day* when all of these hold:

- T² exceeds its limit;
- at least 3 indicators each have |shift| ≥ 2 (members);
- the members span at least 2 categories.

A pattern is **reported** once the criteria have held for 5 days (lapses of up to 2 days are tolerated), described as **emerging**, then **sustained** after 14 days, then **resolved**. Core members are indicators that were members on at least half of the pattern's days.

For each pattern the engine reports the share of members' individual readings that were inside their ordinary ±2 robust SD range, how many members had not individually reached a sustained deviation when the pattern was reported, and the lead in days over the first single-indicator sustained deviation.

**Evidence strength** is graded in words (limited, moderate, strong) from the number of core members, persistence, data completeness and how far T² exceeds its limit. It is explicitly not a confidence percentage, not a probability of illness and not medical certainty. A model tail probability is shown and labelled as a measure of departure from baseline only.

## 5. Relationship evaluation (`relationships.ts`)

Two indicators are described as related only when their **day-to-day fluctuations** are associated beyond chance:

1. **Detrend**: each series minus its 15-day centred rolling median. A shared slow drift therefore cannot create a correlation (tested with two independent series that both trend strongly).
2. **Lagged rank correlation**: Spearman ρ at lags −3 to +3 days.
3. **Effective sample size**: reduced for autocorrelation in both series (Pyper & Peterman, 1998).
4. **Significance**: Fisher z test with the effective sample size.
5. **Lag selection**: the best lag's p-value is multiplied by the number of lags tested (Bonferroni).
6. **Multiplicity across pairs**: Benjamini–Hochberg q-values over every pair tested that day.
7. **Stability**: the sign must agree in both halves of the record.

A relationship is **supported** only if q ≤ 0.05, |ρ| ≥ 0.25, at least 30 paired days, effective sample size ≥ 20, and the halves agree. Otherwise it is **not established**, with the reason stated, or **insufficient data** (too few paired days, or a sparsely sampled indicator).

Overlap of deviation periods is reported descriptively and is never counted as evidence. Every result carries the statement that an association does not show causation and that a shared driver could produce it.

## 6. Countermeasure response tracking (`response.ts`)

For an action the crew member recorded under an approved protocol, the engine compares a pre-action window with a post-action window (14 days each by default; the demonstration uses 21):

- observations and completeness in each window;
- window medians as distances from the personal baseline in robust-SD units;
- Hodges–Lehmann shift estimate and Mann–Whitney U test between windows;
- Theil–Sen slopes before and after.

Each indicator is classified as *closer to baseline*, *further from baseline*, *no clear change*, *already near baseline* or *insufficient data*. A movement requires both a change in distance of at least 0.5 robust SD and p < 0.05.

Context that could explain a change independently is listed: logged mission events and other actions inside the windows, a recovery that had already begun before the action (pre-trend), and data gaps.

Before 7 follow-up days exist the result is **awaiting data** and nothing is compared. The summary always states that the observations cannot determine whether the action caused the change. The engine never recommends or prescribes an action.

## 7. Explainable insights (`insights.ts`)

Each insight has a stable identifier and carries its indicators with current values and baselines, date range, calculations performed, data completeness, an evidence statement, limitations and suggested review steps. Kinds: multivariable pattern, sustained deviation, unusual change, gradual trend, response evaluation, insufficient evidence, normal variation.

## 8. Verification

`npm test` runs 67 engine tests, including:

- robust statistics against known values and against outliers;
- baselines with missing data, rejected readings, sparse cadence and rolling mode;
- false-alarm rate on stable series below 2% of days;
- a sustained shift detected while most single readings stay ordinary;
- a two-day outage not called sustained;
- no joint pattern in independent noise, in non-overlapping shifts, or within a single category;
- a planted lagged association recovered with the correct leader, lag and sign;
- independent pairs and shared-trend pairs not supported;
- at most 2 false relationships across 140 unrelated pairs;
- response classification, confounders, pre-trend, and the absence of causal language.

In a scan of 40 random realizations of the demonstration generator, every realization produced a joint pattern during the planted overlap, first reported between days 78 and 101 in about three quarters of them. A false relationship involving the deliberately unrelated exercise log appeared in 4 of 40, in line with the 5% false-discovery rate. The demonstration fixes one representative realization.

## 9. Limitations

- The engine has only been run on synthetic data. Thresholds have not been calibrated on real astronaut records and have no clinical validation.
- The joint model is estimated from the same baseline window it is compared against, which makes early false alarms somewhat more likely than the nominal rate.
- The chi-square limit for T² is asymptotic and assumes roughly normal smoothed deviations.
- Count data with small values (for example attention lapses) are coarse; their percentage changes can look large.
- Relationship tests assume the association is stable over the record and linear in rank.
- A baseline taken early in a mission may already reflect adaptation to spaceflight.

## References

- Lowry, Woodall, Champ & Rigdon (1992). A multivariate exponentially weighted moving average control chart. *Technometrics* 34(1).
- Iglewicz & Hoaglin (1993). *How to Detect and Handle Outliers* (modified z-score).
- Pyper & Peterman (1998). Comparison of methods to account for autocorrelation in correlation analyses of fish data. *Can. J. Fish. Aquat. Sci.* 55.
- Benjamini & Hochberg (1995). Controlling the false discovery rate. *J. R. Stat. Soc. B* 57(1).
- Sen (1968) and Theil (1950) for the slope estimator; Mann (1945) and Kendall (1975) for the trend test.
