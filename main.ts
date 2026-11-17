// gta6-twitch-ccu-forecast-01 (v3): forecast GTA VI's launch-day Twitch CCU,
// hour by hour, as five quantiles per hour (levels 0.05, 0.25, 0.5, 0.75,
// 0.95) for hours 2..24 of the release day (2026-11-19 UTC), anchored on the
// case's hour-1 print.
//
// MODEL — "peak/shape factorisation". A different model from v1 (a weighted
// median ratio curve) and v2 (a per-hour ridge on raw log-ratios). Each
// comparable launch's log-ratio curve is split into two pieces that behave
// very differently:
//
//   ln(v_h / v_1) = ln(peak / v_1) + ln(v_h / peak)
//
//   * PEAK. The first term is one number per launch: how much the day's
//     peak exceeds hour 1. It is almost a function of size alone (log
//     peak-ratio correlates -0.94 with log hour-1 size across the 38
//     comparables): launches under ~10k hour-1 viewers peak 5-2000x (their
//     hour 1 was still pre-unlock), launches over ~300k peak at only
//     1.0-1.35x. The peak is fitted by a kernel-weighted ridge on
//     [1, ln v1 - ln p1, rolling, (ln pre24 - ln pre24_target)], floored
//     at 0 in log terms because a day's peak cannot sit below its hour 1.
//     Because the fit is local (Gaussian kernel, bandwidth 1.25 in log
//     units) and the peak ratio saturates near 1x for big launches, a
//     target bigger than every comparable — GTA VI's hour 1 may exceed
//     ELDEN RING's 875k — gets a sane peak near 1.0-1.2x instead of a
//     linear extrapolation downwards.
//   * SHAPE. The second term is the day's shape normalised by its own
//     peak: always <= 0, and far more stable across sizes than the raw
//     ratio (the morning dip, the US-unlock step at hours 5-6, the evening
//     climb and the late decay look alike once each curve is divided by
//     its peak). It is fitted per hour by the same kernel-weighted ridge
//     on the same features, so the shape a target gets is the shape of
//     launches its own size with its own unlock type.
//   * KERNEL + DOWNWEIGHTING. Launches vote with a Gaussian kernel on
//     |ln v1 - ln p1|; launches whose hour 1 was still pre-unlock
//     (peak/v1 > 20) are downweighted 0.15x, and 0.2x again above 100x —
//     their curves measure unlock timing, not the day's shape.
//   * HYPE. The pre-launch 24h geometric mean of the category (from the
//     case's `history`, and from each comparable's own pre-launch hourly
//     points) enters as a heavily shrunk term (penalty 3.0) and only for
//     smaller targets (hour-1 print < 150k); for a big launch like GTA VI
//     it is switched off entirely.
//   * SPREAD. Per hour, sigma is the kernel-weighted spread of the
//     comparables' full log-ratios around the target's predicted median,
//     times 0.6, clamped to [0.18, 0.85] — calibrated so the 90% band
//     covers about 0.9 of scored hours. Quantiles are lognormal:
//     q_tau = p1 * exp(median_h + z_tau * sigma_h).
//
// VALIDATION (local, on data shipped in the kit — see MODEL.md):
//   - Practice (4 cases, true answers from SullyGnome): loss 0.153
//     (p00 0.172, p01 0.120, p02 0.108, p03 0.214), 90% coverage ~0.91.
//     v2 scored 0.154 on the same cases; the house baseline 0.387.
//   - Leave-one-out over the 38 comparables: loss 0.385 (v2: 0.399).
//   - Leave-one-out over big launches only (hour-1 >= 100k, GTA VI's
//     regime): loss 0.174 (v2: 0.175).
//   - Synthetic GTA-like targets (p1 = 500k / 750k / 1.2M): median ratios
//     at hours 5 / 12 / 19 / 21 are 0.72 / 0.66 / 1.22 / 1.18,
//     0.71 / 0.58 / 1.06 / 1.01 and 0.72 / 0.52 / 0.92 / 0.87 —
//     a sane, near-flat evening for a launch bigger than any comparable.
//
// The program is deterministic (no randomness, no clock, no network): the
// same case file always produces the same bytes. It reads every *.in file
// in the input directory and writes one <id>.out per case: exactly 23 rows,
// hours 2..24.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z_SCORES = [
  -1.6448536269514722, -0.6744897501960817, 0, 0.6744897501960817,
  1.6448536269514722,
];
// Gaussian kernel bandwidth on ln(v1), in log units.
const KERNEL_BW = 1.25;
// Ridge penalties: size slope, hype slope, rolling term.
const PEN_SIZE = 0.1;
const PEN_HYPE = 3.0;
const PEN_ROLL = 1.0;
// The hype term is used only when the hour-1 print is below this.
const HYPE_P1_LIMIT = 150000;
// Spread calibration: residual std is multiplied by this, then clamped.
const SIGMA_SCALE = 0.6;
const SIGMA_LO = 0.18;
const SIGMA_HI = 0.85;
// Fallback spread per square-root hour (the house baseline's), used only
// when an hour has no usable comparable launch at all.
const FALLBACK_SIGMA = 0.15;
// Downweight for launches whose hour 1 was still pre-unlock.
const PRE_WEIGHT = 0.15;
const PRE_HARD_WEIGHT = 0.2;
const PRE_RATIO = 20;
const PRE_HARD_RATIO = 100;

type JsonNum = number;

interface KnownRow {
  hour: number;
  viewers: number;
}
interface HourlyPoint {
  from: string;
  viewers: number;
}
interface HistoryPoint {
  at: string;
  viewers: number;
}
interface ComparableRaw {
  name: string;
  day_start: string;
  hourly: HourlyPoint[];
  unlock?: string;
}
interface CaseFile {
  levels: number[];
  known: KnownRow[];
  forecast: Array<{ hour: number }>;
  day_start?: string;
  comparables?: ComparableRaw[];
  history?: HistoryPoint[];
  notes?: string;
}

/** One comparable launch, reduced to what the model needs. */
interface Launch {
  logV1: number;
  logPeakRatio: number;
  preUnlockRatio: number;
  pre24: number | null;
  rolling: boolean;
  /** viewers by release-day hour (1..24). */
  byHour: Map<number, number>;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function geoMean(values: number[]): number | null {
  const xs = values.filter((v) => typeof v === "number" && v > 0);
  if (xs.length === 0) return null;
  let s = 0;
  for (const v of xs) s += Math.log(v);
  return Math.exp(s / xs.length);
}

/** "Rolling midnight local" unlock? Parsed from free text (a comparable's
 *  `unlock` field, or the case's `notes` for the target). */
function unlockIsRolling(text: string | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes("rolling") || t.includes("midnight local");
}

function parseTime(s: string): number {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

/** Reduce one comparable's hourly curve to a Launch, or null when its
 *  hour-1 print is missing. */
function summariseLaunch(raw: ComparableRaw): Launch | null {
  const day0 = parseTime(raw.day_start);
  if (Number.isNaN(day0)) return null;
  const byHour = new Map<number, number>();
  const pre: number[] = [];
  for (const p of raw.hourly ?? []) {
    if (typeof p.viewers !== "number" || p.viewers <= 0) continue;
    const t = parseTime(p.from);
    if (Number.isNaN(t)) continue;
    const dh = (t - day0) / 3_600_000;
    if (dh >= -24 && dh < 0) pre.push(p.viewers);
    const hour = Math.floor(dh) + 1;
    if (hour >= 1 && hour <= 24 && !byHour.has(hour)) byHour.set(hour, p.viewers);
  }
  const v1 = byHour.get(1);
  if (v1 === undefined) return null;
  let peak = 0;
  for (const v of byHour.values()) peak = Math.max(peak, v);
  return {
    logV1: Math.log(v1),
    logPeakRatio: Math.log(peak / v1),
    preUnlockRatio: peak / v1,
    pre24: geoMean(pre),
    rolling: unlockIsRolling(raw.unlock),
    byHour,
  };
}

/** The target's pre-launch 24h geometric mean, from the case's `history`
 *  (minute reads for the final, SullyGnome hourly points for practice). */
function targetPre24(c: CaseFile): number | null {
  const day0 = parseTime(c.day_start ?? "");
  if (Number.isNaN(day0)) return null;
  const vals: number[] = [];
  for (const p of c.history ?? []) {
    if (typeof p.viewers !== "number" || p.viewers <= 0) continue;
    const t = parseTime(p.at);
    if (Number.isNaN(t)) continue;
    if ((t - day0) / 3_600_000 >= -24 && (t - day0) / 3_600_000 < 0) {
      vals.push(p.viewers);
    }
  }
  return geoMean(vals);
}

/** Solve A x = b for a small dense system (Gaussian elimination with
 *  partial pivoting, then back-substitution). Returns null if singular. */
function solve(Ain: number[][], bin: number[]): number[] | null {
  const n = bin.length;
  const a = Ain.map((row, i) => [...row, bin[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    }
    if (piv !== col) {
      const tmp = a[col];
      a[col] = a[piv];
      a[piv] = tmp;
    }
    if (Math.abs(a[col][col]) < 1e-12) return null;
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / a[col][col];
      for (let cc = col; cc <= n; cc++) a[r][cc] -= f * a[col][cc];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = a[i][n];
    for (let j = i + 1; j < n; j++) s -= a[i][j] * x[j];
    x[i] = s / a[i][i];
  }
  return x;
}

interface FitRow {
  y: number;
  w: number;
  f: number[];
}

/** Weighted ridge fit. `rows` carry the outcome, the kernel weight and the
 *  feature vector; `pens` the ridge penalty per feature (0 for the
 *  intercept). Returns the coefficient vector, or null when singular. */
function ridgeFit(rows: FitRow[], pens: number[]): number[] | null {
  const k = rows[0].f.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (const r of rows) {
    for (let i = 0; i < k; i++) {
      b[i] += r.w * r.f[i] * r.y;
      for (let j = 0; j < k; j++) a[i][j] += r.w * r.f[i] * r.f[j];
    }
  }
  for (let i = 1; i < k; i++) a[i][i] += pens[i];
  return solve(a, b);
}

mkdirSync(OUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(IN_DIR).filter((f) => f.endsWith(".in")).sort();
for (const file of inputs) {
  const id = file.slice(0, -".in".length);
  const c = JSON.parse(readFileSync(join(IN_DIR, file), "utf8")) as CaseFile;
  if (
    c.levels.length !== LEVELS.length ||
    c.levels.some((t, j) => t !== LEVELS[j])
  ) {
    throw new Error(
      `${file} asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`,
    );
  }
  const first = c.known.find((k) => k.hour === 1);
  if (first === undefined) throw new Error(`${file} has no hour-1 print`);
  const p1 = Math.max(1, first.viewers);
  const logP1 = Math.log(p1);
  const pre24Target = targetPre24(c);
  const useHype = pre24Target !== null && p1 < HYPE_P1_LIMIT;
  const targetRolling = unlockIsRolling(c.notes) ? 1 : 0;

  const launches: Launch[] = [];
  for (const raw of c.comparables ?? []) {
    const s = summariseLaunch(raw);
    if (s !== null) launches.push(s);
  }

  /** Feature vector + kernel weight of one launch, centred on the target. */
  function features(l: Launch): { w: number; f: number[] } {
    let w = Math.exp(-0.5 * ((l.logV1 - logP1) / KERNEL_BW) ** 2);
    if (l.preUnlockRatio > PRE_RATIO) w *= PRE_WEIGHT;
    if (l.preUnlockRatio > PRE_HARD_RATIO) w *= PRE_HARD_WEIGHT;
    const f = [1, l.logV1 - logP1];
    if (useHype) {
      f.push(
        l.pre24 !== null && pre24Target !== null
          ? Math.log(l.pre24) - Math.log(pre24Target)
          : 0,
      );
    }
    f.push(l.rolling ? 1 : 0);
    return { w, f };
  }
  /** Penalties lined up with the features: [intercept 0, size, hype?, roll]. */
  function penalties(): number[] {
    const p = [0, PEN_SIZE];
    if (useHype) p.push(PEN_HYPE);
    p.push(PEN_ROLL);
    return p;
  }
  /** The target's own feature values: centred, so the intercept is the
   *  prediction at the target and the rolling slot takes the target's flag. */
  function targetPrediction(coef: number[]): number {
    return coef[0] + coef[coef.length - 1] * targetRolling;
  }

  // --- PEAK: one number per launch, log(peak / v1). ---
  const peakRows: FitRow[] = launches.map((l) => {
    const { w, f } = features(l);
    return { y: l.logPeakRatio, w, f };
  });
  const peakCoef = peakRows.length > 0 ? ridgeFit(peakRows, penalties()) : null;
  // A day's peak cannot sit below its hour 1, so the log peak is floored at 0.
  const logPeak =
    peakCoef === null ? 0 : Math.max(0, targetPrediction(peakCoef));

  // --- SHAPE: per hour, log(v_h / peak), fitted the same way. ---
  const hours = c.forecast.map(({ hour }) => hour).sort((a, b) => a - b);
  const outHours = hours.map((h) => {
    const rows: FitRow[] = [];
    const owners: Launch[] = [];
    for (const l of launches) {
      const vh = l.byHour.get(h);
      if (vh === undefined) continue;
      const { w, f } = features(l);
      rows.push({ y: Math.log(vh) - Math.log(peakOf(l)), w, f });
      owners.push(l);
    }
    let median = logPeak;
    let sigma = FALLBACK_SIGMA * Math.sqrt(h - 1);
    if (rows.length > 0) {
      const coef = ridgeFit(rows, penalties());
      if (coef !== null) {
        median = logPeak + targetPrediction(coef);
        // Spread: the kernel-weighted spread of the comparables' full
        // log-ratios around the target's predicted median.
        let wSum = 0;
        let varSum = 0;
        for (let i = 0; i < rows.length; i++) {
          const l = owners[i];
          const vh = l.byHour.get(h)!;
          const full = Math.log(vh / Math.exp(l.logV1));
          varSum += rows[i].w * (full - median) * (full - median);
          wSum += rows[i].w;
        }
        sigma = Math.max(
          SIGMA_LO,
          Math.min(SIGMA_HI, Math.sqrt(varSum / Math.max(wSum, 1e-9)) * SIGMA_SCALE),
        );
      }
    }
    const q = Z_SCORES.map((z) => {
      const v = round2(p1 * Math.exp(median + z * sigma));
      return Math.min(1e9, Math.max(0.01, v));
    });
    for (let i = 1; i < q.length; i++) q[i] = Math.max(q[i], q[i - 1]);
    return { hour: h, q };
  });
  writeFileSync(join(OUT_DIR, `${id}.out`), `${JSON.stringify({ hours: outHours })}\n`);
}

/** A launch's peak viewers (max over its release-day hours). */
function peakOf(l: Launch): number {
  let peak = 0;
  for (const v of l.byHour.values()) peak = Math.max(peak, v);
  return peak;
}
