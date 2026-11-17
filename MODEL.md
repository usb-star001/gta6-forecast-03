# Model: peak/shape factorisation (v3)

## What is forecast

For each hour h = 2..24 of GTA VI's release day (2026-11-19 UTC), five
quantiles of Twitch concurrent viewers in the "Grand Theft Auto VI" category,
at levels 0.05 / 0.25 / 0.5 / 0.75 / 0.95, anchored on the case's hour-1 print
p1 (00:00–01:00 UTC). Scored by mean pinball loss on the log scale.

## Why a third version

Version 1 predicted each hour's log-ratio `ln(v_h / v_1)` as a weighted
median across comparable launches (practice 0.260). Version 2 fitted a
per-hour kernel-weighted ridge on the raw log-ratio, with a size slope, a
rolling-unlock term and a pre-launch hype term (practice 0.154, LOO 0.399).
Diagnosing v2 per hour showed the remaining structure it misses:

- **The peak is almost a function of size alone.** Across the 38
  comparables, log(peak/v1) correlates −0.94 with log hour-1 size: launches
  under ~10k hour-1 viewers peak 5–2000× (their hour 1 was still
  pre-unlock), launches over ~300k peak at only 1.0–1.35×. A per-hour
  linear size slope extrapolates that relation past the data; the peak
  itself saturates, and the model should say so.
- **The shape is size-invariant once normalised.** Divide each launch's
  curve by its own peak and the morning dip, the US-unlock step at hours
  5–6, the evening climb and the late decay look alike across sizes. The
  raw log-ratio mixes the peak level (size-driven) with the shape
  (unlock-driven); fitting them separately lets each use the right
  predictors.
- **The evening peak is flattened by smoothing.** V2's 3-hour moving
  average pulls the evening peak down; the factorised model needs no
  smoothing because the shape fit is already smooth across hours.

## The v3 model

Each comparable launch's log-ratio curve is split as

```
ln(v_h / v_1) = ln(peak / v_1) + ln(v_h / peak)
```

- **Peak.** One number per launch. Fitted by a kernel-weighted ridge on
  `[1, ln v1 − ln p1, rolling, (ln pre24 − ln pre24_target)]`, with
  penalties 0.1 on the size slope, 3.0 on hype, 1.0 on rolling. The fitted
  log peak is floored at 0 — a day's peak cannot sit below its hour 1.
  The fit is local (Gaussian kernel on |ln v1 − ln p1|, bandwidth 1.25 in
  log units), so a target bigger than every comparable is predicted from
  the biggest comparables, whose peak ratios are ~1.0–1.35×.
- **Shape.** Per hour, `ln(v_h / peak)` is fitted by the same
  kernel-weighted ridge on the same features. The target's median
  log-ratio at hour h is its fitted peak plus its fitted shape.
- **Kernel weights and downweighting.** As in v2: Gaussian kernel on size
  closeness; launches whose hour 1 was still pre-unlock (peak/v1 > 20)
  are downweighted 0.15× (another 0.2× above 100×).
- **Pre-launch hype.** The geometric mean of the category's viewers in
  the 24 hours before the release day (from the case's `history`, and from
  each comparable's own pre-launch hourly points). Used only for smaller
  targets (hour-1 print < 150k) and heavily shrunk (penalty 3.0); for a
  big launch like GTA VI it is switched off, so it cannot distort the
  final.
- **Rolling unlock.** Binary: 1 when a launch unlocked at rolling
  midnight local — parsed from the comparable's `unlock` text ("rolling"
  or "midnight local"), and from the case's `notes` for the target.
  Rolling launches ramp harder into the US evening.
- **Spread.** Per hour, sigma is the kernel-weighted spread of the
  comparables' full log-ratios around the target's predicted median,
  × 0.6, clamped to [0.18, 0.85]. Quantiles are lognormal:
  `q_τ = p1 · exp(med_h + z_τ · σ_h)`.

## Validation (local)

Scoring is mean pinball loss over the 23 hours × 5 quantiles, exactly as
the kit scores it. Practice answers are the true SullyGnome hourly
averages for the four practice launches (verified to match the case files'
hour-1 prints exactly). The harness reproduces the server's numbers for
v1 (0.260), v2 (0.154) and the house baseline (0.387), so the v3 numbers
below are on the same scale.

| model | practice mean | p00 | p01 | p02 | p03 | LOO | LOO-big |
| --- | --- | --- | --- | --- | --- | --- | --- |
| house baseline | 0.387 | 0.744 | 0.287 | 0.215 | 0.303 | 0.930 | 0.261 |
| v1 (weighted median) | 0.260 | 0.464 | 0.223 | 0.148 | 0.207 | 0.801 | 0.231 |
| v2 (per-hour ridge) | 0.154 | 0.168 | 0.119 | 0.109 | 0.220 | 0.399 | 0.175 |
| **v3 (this)** | **0.153** | **0.172** | **0.120** | **0.108** | **0.214** | **0.385** | **0.174** |

- Practice: 4 cases, true answers. Coverage 0.91.
- LOO: leave-one-out over the 38 comparables (each launch predicted from
  the other 37). LOO-big: targets with hour-1 ≥ 100k (GTA VI's regime,
  n=16).
- Synthetic GTA-like targets (p1 = 500k / 750k / 1.2M, rolling): median
  ratios at hours 5 / 12 / 19 / 21 are 0.72 / 0.66 / 1.22 / 1.18,
  0.71 / 0.58 / 1.06 / 1.01 and 0.72 / 0.52 / 0.92 / 0.87 — a sane,
  near-flat evening for a launch bigger than any comparable (v2 gave
  0.70 / 0.58 / 1.01 / 0.97 at p1 = 750k).
- Runtime: ~0.3 s for all four practice cases (limit 8 s per case).

The remaining worst case is p03 (Spider-Man 2, 0.214): it has an
idiosyncratic midday dip (hour 11 prints 0.37× hour 1, hour 12 0.32×)
that no comparable-based model predicts — that loss is mostly irreducible
noise, not a shape the model can learn.

## What did not work (tested and rejected)

- **Functional PCA basis regression** (project each comparable's curve
  onto the top 2–3 principal components — 88% / 7% / 3% of variance —
  and regress the scores on size, rolling and hype): practice 0.147 but
  LOO 0.429, LOO-big 0.201. The practice gain does not generalise; the
  score regressions are noisier than the per-hour fits.
- **Gradient boosting** (per-hour depth-2 trees on size, rolling and
  hype, 12–25 rounds): practice 0.162–0.170, LOO 0.433, LOO-big 0.213.
  With 37 training launches the trees overfit; the linear ridge
  generalises better.
- **Blends** (v2 + peak/shape, v2 + FPCA, three-way): practice 0.146–
  0.152 but LOO 0.399–0.410, LOO-big 0.174–0.184. No blend beats its
  best component on LOO.
- **Rolling × size interaction** (a rolling term whose coefficient varies
  with size): LOO-big 0.172, but practice 0.153–0.156 and LOO 0.394–
  0.399 — no clear gain over the factorised model alone, so it was left
  out to keep the model simple.
- **Spread recalibration** (sigma multiplier 0.4–0.9): narrower spreads
  help the 4 practice cases (0.144 at 0.4) but hurt LOO (0.426); wider
  spreads help LOO slightly (0.394 at 0.8) but hurt practice (0.167).
  0.6 is the compromise that keeps both honest.
- **No smoothing on v2's median curve**: practice 0.152, LOO 0.399 —
  the factorised model subsumes this by construction.

## What the program does not use

No hardcoded GTA VI numbers, no memorized practice answers (the 0.000001-loss
entries on the board memorized the public practice curves; the final is
graded on the real Nov 19 recording nobody has, so memorization cannot win
there), no network, no clock, no randomness. The program reads only the case
file it is given and is deterministic — two runs are byte-identical.
