# Sources

Grounding for the forecast model in `main.ts` / `MODEL.md`. The model itself
is fitted at run time from the case file's `comparables` (SullyGnome hourly
Twitch category averages shipped in the kit); the sources below are the
external facts that shaped the design and the checks on it.

## Launch-day Twitch viewership (the comparables' own numbers)

- **SullyGnome hourly Twitch category averages** — the source of every
  comparable launch's curve and of the practice answers used for local
  validation. Practice launches: Marvel's Wolverine
  (https://sullygnome.com/game/Marvel's_Wolverine),
  Red Dead Redemption 2 (https://sullygnome.com/game/Red_Dead_Redemption_2),
  God of War Ragnarök
  (https://sullygnome.com/game/God_of_War_Ragnar%C3%B6k), Marvel's
  Spider-Man 2 (https://sullygnome.com/game/Marvel's_Spider-Man_2).
  Fetch pattern (from the kit's `input/NOTICE.txt`):
  `GET https://sullygnome.com/api/charts/linecharts/getconfig/GameViewers/30/0/<id>/<name>/%20/%20/<YYYY>/<M>/%20/0/`
  ("Average viewers" dataset). SullyGnome asks not to bulk-download the site;
  only the four practice games' release-month curves were read, once each,
  for validation. The fetched averages match the case files' hour-1 prints
  exactly (Wolverine 23,357; RDR2 116,550; GoW 269,517; Spider-Man 2 119,087),
  confirming they are the same data the grader uses.
- **Kit competition notes** (`kit/.../competition.yaml`, `input/NOTICE.txt`):
  GTA VI Twitch category probed 2026-11-17T03:10Z at 1,240 viewers / 181
  channels; GTA V at the same read 81,611 viewers / 3,514 channels. GTA VI
  category's own pre-launch history in the case file: first point
  2026-08-27T17:00Z (Netflix extended-look premiere), max 1,418,094 viewers,
  ~1,400–2,000 viewers in the days before launch.
- **Unlock-type and tier notes** — each comparable's `unlock` text in the case
  file states whether it unlocked at rolling midnight local or simultaneously
  worldwide, and flags early-access-contaminated and weak analogues. The v3
  model reads the rolling flag from that text at run time.
- **Peak-vs-size relation** — measured on the case file's own comparables:
  log(peak/v1) correlates −0.94 with log hour-1 size; launches over ~300k
  hour-1 viewers peak at 1.0–1.35×, launches under ~10k at 5–2000× (their
  hour 1 was still pre-unlock). This is what the peak/shape factorisation
  is built on.

## Big-launch peaks (why hour 1 will be large)

- **ELDEN RING, launch day 2022-02-25**: ~910,000 peak concurrent Twitch
  viewers, third-best Twitch debut at the time (Kotaku, 2022-02-25;
  https://kotaku.com/elden-ring-twitch-steam-dark-souls-fromsoftware-records-1848593903).
  In the case data its hour-1 print is 875,155 viewers.
- **Cyberpunk 2077, launch day 2020-12-10**: ~1,140,960 peak Twitch viewers
  (reported in the same launch-day coverage; hour-1 print in the case data
  851,999 viewers).
- **GTA V on Twitch**: all-time peak 1,140,747 viewers (TwitchTracker, via
  duvalwire.com, https://duvalwire.com/news/gta-5-twitch-numbers-gta-6-streaming-estimate);
  1.4 billion hours watched in 2024, Twitch's most-watched game that year.

## GTA VI hype (why the launch is the biggest regime, not a small one)

- **Trailer 1 (Dec 4, 2023)**: 93 million YouTube views in 24 hours, a
  record for a non-music video debut (Rockstar / Take-Two reporting, via
  https://www.keengamer.com/articles/features/gta-vi-how-the-hype-and-launch-windows-compare-to-vice-city-and-gta-v/).
- **Trailer 2 (May 6, 2025)**: 475 million views across platforms in its
  first 24 hours, reported by Rockstar as the biggest video launch of all
  time (same source).
- **An Extended Look (Netflix, Aug 27, 2026)**: 31.1 million views in four
  days, #1 in 87 countries (same source). The GTA VI Twitch category's
  premiere-day spike (1,418,094 viewers) is the same event, in the case data.
- **Release**: November 19, 2026, PlayStation 5 and Xbox Series X|S only,
  rolling midnight local unlock — New Zealand first 2026-11-18T11:00Z,
  central Europe 23:00Z, UK 00:00Z, US east coast 05:00Z, US west coast
  08:00Z (kit RULES.txt).

## Scoring / format

- Kit `RULES.txt` (gta6-twitch-ccu-forecast-01): pinball loss on the log
  scale, house baseline loss ~0.387 on the practice, entry format
  `{"hours": [{"hour": h, "q": [q05, q25, q50, q75, q95]}]}` for hours 2–24.
