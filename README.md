# GTA VI launch-day Twitch forecast — v3

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/usb-star001/gta6-forecast-03/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/usb-star001/gta6-forecast-03/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecasts how many people watch Grand Theft Auto VI live on Twitch in each hour
of its release day, 2026-11-19 (UTC), as five quantiles per hour (hours 2–24),
from everything recorded up to the end of hour 1. Built for the
[make.fun bounty](https://make.fun/bounty/gta6-twitch-ccu-forecast-01)
($250 total, scored by mean pinball loss on the log scale).

This is version 3. Version 1 (a weighted-median ratio curve,
`usb-star001/gta6-forecast-01`) scored 0.260 on the practice board; version 2
(a per-hour kernel-weighted ridge, `usb-star001/gta6-forecast-02`) scored
**0.154**. This version scores **0.153** on the same practice cases, with a
better leave-one-out loss (0.385 vs 0.399).

## The model

`main.ts` (Node 22, standard library only) fits a **peak/shape factorisation**
at run time, from the case file's own comparable launches:

1. Anchor on the case's hour-1 print `p1` (UK, central Europe and
   New Zealand/Australia are already unlocked in hour 1).
2. Split each comparable launch's log-ratio curve into a **peak**
   (`ln(peak / v1)`, one number per launch, almost a function of size
   alone: launches over ~300k hour-1 viewers peak at only 1.0–1.35×) and
   a **shape** (`ln(v_h / peak)`, the day's curve normalised by its own
   peak — far more stable across sizes than the raw ratio).
3. Fit the peak with a kernel-weighted ridge on size, rolling-unlock type
   and pre-launch hype, floored at 0 in log terms (a day's peak cannot sit
   below its hour 1); fit the shape per hour with the same ridge. Because
   the peak saturates near 1× for big launches, a target bigger than any
   comparable — GTA VI's hour 1 may exceed ELDEN RING's 875k — gets a
   sane, near-flat evening instead of a linear extrapolation downwards.
4. Spread: the kernel-weighted spread of comparable outcomes around the
   predicted median, calibrated so the 90% band covers ~0.9 of scored hours.

Full details, measured effects and rejected variants: [`MODEL.md`](MODEL.md).
Sources: [`SOURCES.md`](SOURCES.md).

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `*.in` case in the input directory and writes one `<id>.out` per
case: 23 rows (hours 2–24) of five quantiles each. Deterministic — two runs
are byte-identical. No network, no clock, no randomness. Runs in ~0.3 s for
all four practice cases (limit 8 s per case).

## Layout

- `main.ts` — the forecaster (the entrypoint; no other language file at root)
- `MODEL.md` — method, measured effects, validation, rejected variants
- `SOURCES.md` — grounding sources for the numbers the model is built on
- `LICENSE` — MIT
