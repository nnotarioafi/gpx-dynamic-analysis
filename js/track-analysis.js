/**
 * track-analysis.js
 * Computes track statistics and climb analysis from parsed GPX points.
 */

// ---------------------------------------------------------------------------
// Haversine distance between two lat/lon points, returns km
// ---------------------------------------------------------------------------
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Build enriched point array with cumulative distance and smoothed elevation
// ---------------------------------------------------------------------------
export function enrichPoints(points) {
  const enriched = [];
  let cumDist = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      cumDist += haversine(prev.lat, prev.lon, p.lat, p.lon);
    }
    enriched.push({ ...p, dist: cumDist });
  }
  return enriched;
}

// ---------------------------------------------------------------------------
// Basic track statistics (no time-based metrics)
// ---------------------------------------------------------------------------
export function computeStats(enriched) {
  const withEle = enriched.filter(p => p.ele !== null);

  let gain = 0;
  let loss = 0;

  for (let i = 1; i < withEle.length; i++) {
    const delta = withEle[i].ele - withEle[i - 1].ele;
    if (delta > 0) gain += delta;
    else loss += Math.abs(delta);
  }

  let maxEle = withEle.length ? -Infinity : null;
  let minEle = withEle.length ?  Infinity : null;
  for (const p of withEle) {
    if (p.ele > maxEle) maxEle = p.ele;
    if (p.ele < minEle) minEle = p.ele;
  }
  const totalDist = enriched[enriched.length - 1]?.dist ?? 0;

  return {
    totalDistKm: totalDist,
    elevationGainM: gain,
    elevationLossM: loss,
    maxElevationM: maxEle,
    minElevationM: minEle,
    pointCount: enriched.length,
    // ITRA km-effort = distance + gain/100
    itraKmEffort: totalDist + gain / 100,
    // Net elevation: finish minus start
    startElevationM: withEle.length ? withEle[0].ele : null,
    finishElevationM: withEle.length ? withEle[withEle.length - 1].ele : null,
    netElevationM: withEle.length ? withEle[withEle.length - 1].ele - withEle[0].ele : null,
  };
}

// ---------------------------------------------------------------------------
// Climbs / Descents analysis
//
// Algorithm:
//  1. Smooth elevations with a small moving average to remove GPS noise.
//  2. Find all local minima and maxima on the smoothed profile.
//  3. Merge adjacent extrema whose elevation difference is below `thresholdM`.
//     Repeat until no more merges are possible.
//  4. Build climb segments (min→max) and descent segments (max→min).
// ---------------------------------------------------------------------------

function movingAvg(arr, window = 5) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const lo = Math.max(0, i - Math.floor(window / 2));
    const hi = Math.min(arr.length - 1, i + Math.floor(window / 2));
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += arr[j];
    out.push(sum / (hi - lo + 1));
  }
  return out;
}

export function analyzeClimbs(enriched, thresholdM = 20) {
  const withEle = enriched.filter(p => p.ele !== null);
  if (withEle.length < 3) return { climbs: [], descents: [] };

  // Binary search: first index where withEle[i].dist >= target
  function lowerBound(target) {
    let lo = 0, hi = withEle.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      withEle[m].dist < target ? (lo = m + 1) : (hi = m);
    }
    return lo;
  }

  const rawEle = withEle.map(p => p.ele);
  const smoothed = movingAvg(rawEle, 7);

  // --- Find extrema ---
  // An extremum is a point where the trend changes direction.
  // We reduce to a sequence of "turning points".
  let turning = [{ idx: 0, ele: smoothed[0], dist: withEle[0].dist }];

  for (let i = 1; i < smoothed.length - 1; i++) {
    const prev = smoothed[i - 1];
    const curr = smoothed[i];
    const next = smoothed[i + 1];
    if ((curr >= prev && curr >= next) || (curr <= prev && curr <= next)) {
      // only keep if different from last turning point
      const last = turning[turning.length - 1];
      if (Math.abs(curr - last.ele) > 0.01) {
        turning.push({ idx: i, ele: curr, dist: withEle[i].dist });
      }
    }
  }
  // Always include last point
  const lastPt = { idx: smoothed.length - 1, ele: smoothed[smoothed.length - 1], dist: withEle[withEle.length - 1].dist };
  if (turning[turning.length - 1].idx !== lastPt.idx) turning.push(lastPt);

  // --- Merge turning points below threshold ---
  // Repeatedly scan the turning point list and remove any point whose elevation
  // difference from BOTH its neighbours is below the threshold (i.e. it is a
  // "small wiggle").  Keep going until nothing changes.
  let changed = true;
  while (changed) {
    changed = false;
    if (turning.length <= 2) break;

    const next = [turning[0]];
    let i = 1;
    while (i < turning.length - 1) {
      const prev = next[next.length - 1];
      const curr = turning[i];
      const nxt  = turning[i + 1];

      const diffPrev = Math.abs(curr.ele - prev.ele);
      const diffNext = Math.abs(curr.ele - nxt.ele);

      if (diffPrev < thresholdM && diffNext < thresholdM) {
        // This turning point is a small bump — skip it entirely
        changed = true;
        i++;
        continue;
      }

      if (diffPrev < thresholdM) {
        // Merge curr into prev: keep whichever is more extreme
        // (higher for peaks, lower for valleys)
        const isCurrPeak = curr.ele > prev.ele;
        if (isCurrPeak ? curr.ele > prev.ele : curr.ele < prev.ele) {
          next[next.length - 1] = curr; // replace prev with curr
        }
        changed = true;
        i++;
        continue;
      }

      next.push(curr);
      i++;
    }
    // Always keep the last point
    next.push(turning[turning.length - 1]);
    turning = next;
  }

  // --- Build climb/descent segments ---
  const climbs = [];
  const descents = [];

  for (let i = 0; i < turning.length - 1; i++) {
    const from = turning[i];
    const to = turning[i + 1];
    const eleDiff = to.ele - from.ele;
    const distKm = to.dist - from.dist;

    if (Math.abs(eleDiff) < thresholdM) continue;

    // Use binary search to slice only the points in this segment range
    const lo = lowerBound(from.dist);
    const hi = lowerBound(to.dist + 1e-9);
    const segPts = withEle.slice(lo, hi);

    let realGain = 0;
    let realLoss = 0;
    let maxGradPct = 0;

    for (let j = 1; j < segPts.length; j++) {
      const dEle = segPts[j].ele - segPts[j - 1].ele;
      const dDist = (segPts[j].dist - segPts[j - 1].dist) * 1000; // m
      if (dDist > 0) {
        const grad = Math.abs(dEle / dDist) * 100;
        if (grad > maxGradPct) maxGradPct = grad;
      }
      if (dEle > 0) realGain += dEle;
      else realLoss += Math.abs(dEle);
    }

    const avgGradPct = distKm > 0 ? (Math.abs(eleDiff) / (distKm * 1000)) * 100 : 0;

    const seg = {
      startDist: from.dist,
      endDist: to.dist,
      startEle: from.ele,
      endEle: to.ele,
      lengthKm: distKm,
      eleDiffM: Math.abs(eleDiff),
      avgGradientPct: avgGradPct,
      maxGradientPct: maxGradPct,
    };

    if (eleDiff > 0) {
      seg.gainM = realGain;
      climbs.push(seg);
    } else {
      seg.lossM = realLoss;
      descents.push(seg);
    }
  }

  return { climbs, descents };
}

// ---------------------------------------------------------------------------
// Selection stats: given a distance range, compute avg ascent/descent rates
// ---------------------------------------------------------------------------
export function selectionStats(enriched, fromKm, toKm) {
  const pts = enriched.filter(p => p.dist >= fromKm && p.dist <= toKm && p.ele !== null);
  if (pts.length < 2) return null;

  let gain = 0;
  let loss = 0;
  let ascentDist = 0;
  let descentDist = 0;

  for (let i = 1; i < pts.length; i++) {
    const dEle = pts[i].ele - pts[i - 1].ele;
    const dDist = pts[i].dist - pts[i - 1].dist; // km
    if (dEle > 0) {
      gain += dEle;
      ascentDist += dDist;
    } else if (dEle < 0) {
      loss += Math.abs(dEle);
      descentDist += dDist;
    }
  }

  const totalDist = pts[pts.length - 1].dist - pts[0].dist;
  // rates in m/km
  const avgAscentRate = ascentDist > 0 ? gain / ascentDist : 0;
  const avgDescentRate = descentDist > 0 ? loss / descentDist : 0;

  return {
    distKm: totalDist,
    gainM: gain,
    lossM: loss,
    avgAscentRateMpKm: avgAscentRate,
    avgDescentRateMpKm: avgDescentRate,
    avgAscentPct: avgAscentRate / 10,   // m/km ÷ 10 = %
    avgDescentPct: avgDescentRate / 10,
  };
}

// ---------------------------------------------------------------------------
// Terrain distribution: % of distance in each gradient category
// ---------------------------------------------------------------------------
export function terrainDistribution(enriched) {
  const withEle = enriched.filter(p => p.ele !== null);
  if (withEle.length < 2) return null;

  const bins = {
    flat: 0,       // < 3%
    modUp: 0,      // 3–10% uphill
    steepUp: 0,    // > 10% uphill
    modDown: 0,    // 3–10% downhill
    steepDown: 0,  // > 10% downhill
  };

  let totalDist = 0;

  for (let i = 1; i < withEle.length; i++) {
    const dEle = withEle[i].ele - withEle[i - 1].ele;
    const dDist = (withEle[i].dist - withEle[i - 1].dist) * 1000; // m
    if (dDist <= 0) continue;

    const gradPct = (dEle / dDist) * 100; // signed
    totalDist += dDist;

    const absPct = Math.abs(gradPct);
    if (absPct < 3)           bins.flat += dDist;
    else if (gradPct > 0 && absPct <= 10) bins.modUp += dDist;
    else if (gradPct > 0)     bins.steepUp += dDist;
    else if (absPct <= 10)    bins.modDown += dDist;
    else                      bins.steepDown += dDist;
  }

  if (totalDist === 0) return null;

  return {
    flat:      (bins.flat      / totalDist) * 100,
    modUp:     (bins.modUp     / totalDist) * 100,
    steepUp:   (bins.steepUp   / totalDist) * 100,
    modDown:   (bins.modDown   / totalDist) * 100,
    steepDown: (bins.steepDown / totalDist) * 100,
  };
}

// ---------------------------------------------------------------------------
// Steepest sections: rolling-window scan for the steepest 200m, 500m, 1km
// Returns { windowM, startDist, endDist, elevChange, gradientPct } for each
// ---------------------------------------------------------------------------
export function steepestSections(enriched) {
  const withEle = enriched.filter(p => p.ele !== null);
  if (withEle.length < 3) return [];

  const windows = [0.2, 0.5, 1.0]; // km
  const results = [];

  for (const winKm of windows) {
    let maxGrad = 0;
    let best = null;

    let j = 0;
    for (let i = 0; i < withEle.length; i++) {
      // Advance j until window distance is met
      while (j < withEle.length - 1 && (withEle[j].dist - withEle[i].dist) < winKm) {
        j++;
      }
      const segDist = withEle[j].dist - withEle[i].dist;
      if (segDist < winKm * 0.8) continue; // skip too-short tail segments

      const elevChange = withEle[j].ele - withEle[i].ele;
      const gradPct = Math.abs(elevChange / (segDist * 1000)) * 100;

      if (gradPct > maxGrad) {
        maxGrad = gradPct;
        best = {
          windowM: winKm * 1000,
          startDist: withEle[i].dist,
          endDist: withEle[j].dist,
          elevChangeM: elevChange,
          gradientPct: gradPct,
          direction: elevChange >= 0 ? 'up' : 'down',
        };
      }
    }

    if (best) results.push(best);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-km splits: gain/loss/net per integer km
// ---------------------------------------------------------------------------
export function perKmSplits(enriched) {
  const withEle = enriched.filter(p => p.ele !== null);
  if (withEle.length < 2) return [];

  const totalDist = withEle[withEle.length - 1].dist;
  const numKm = Math.ceil(totalDist);

  // Allocate buckets once, fill in a single O(n) pass
  const buckets = Array.from({ length: numKm }, (_, i) => ({ km: i + 1, pts: [] }));
  for (const p of withEle) {
    const idx = Math.min(Math.floor(p.dist), numKm - 1);
    buckets[idx].pts.push(p);
  }

  return buckets.map(({ km, pts }) => {
    if (pts.length < 2) return { km, gain: 0, loss: 0, minEle: null, maxEle: null, avgGrad: 0 };

    let gain = 0, loss = 0;
    let minEle = pts[0].ele, maxEle = pts[0].ele;

    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].ele - pts[i - 1].ele;
      if (d > 0) gain += d; else loss += Math.abs(d);
      if (pts[i].ele < minEle) minEle = pts[i].ele;
      if (pts[i].ele > maxEle) maxEle = pts[i].ele;
    }

    const netEle  = pts[pts.length - 1].ele - pts[0].ele;
    const segDist = pts[pts.length - 1].dist - pts[0].dist;

    return {
      km,
      gain:    Math.round(gain),
      loss:    Math.round(loss),
      minEle:  Math.round(minEle),
      maxEle:  Math.round(maxEle),
      avgGrad: segDist > 0 ? (netEle / (segDist * 1000)) * 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Cumulative gain/loss arrays (for chart overlay)
// Returns { dists[], cumGain[], cumLoss[] }
// ---------------------------------------------------------------------------
export function cumulativeGainLoss(enriched) {
  const withEle = enriched.filter(p => p.ele !== null);
  if (withEle.length < 2) return { dists: [], cumGain: [], cumLoss: [] };

  const dists = [withEle[0].dist];
  const cumGain = [0];
  const cumLoss = [0];

  let g = 0, l = 0;
  for (let i = 1; i < withEle.length; i++) {
    const d = withEle[i].ele - withEle[i - 1].ele;
    if (d > 0) g += d;
    else l += Math.abs(d);
    dists.push(withEle[i].dist);
    cumGain.push(g);
    cumLoss.push(l);
  }

  return { dists, cumGain, cumLoss };
}

// ---------------------------------------------------------------------------
// Convert a known reference race (road) into an equivalent trail flat pace.
//
// distKm       : distance of the reference race in km (e.g. 10)
// totalMinutes : finish time in minutes (e.g. 55)
// trailFactor  : trail is ~15% slower than road on flat (default 1.15)
//
// Returns trail flat pace in min/km.
// ---------------------------------------------------------------------------
export function refRaceToTrailPace(distKm, totalMinutes, trailFactor = 1.15) {
  if (distKm <= 0 || totalMinutes <= 0) return 7; // safe fallback
  const roadPace = totalMinutes / distKm;
  return roadPace * trailFactor;
}

// ---------------------------------------------------------------------------
// Finish-time estimate — trail-running two-parameter model
//
// flatPaceMinKm  : runner's flat pace in min/km (default 7)
// ascentCost     : added minutes per metre of gain (default 1/32 ≈ 0.031)
//                  i.e. ~1 min per 32 m climbed
//
// Descent is NOT penalised — trail runners maintain or accelerate on downhills.
// Naismith–Rishbeth was designed for hill-walkers and over-estimates by ~80%.
//
// Returns { totalMinutes, hours, minutes } for the whole track.
// ---------------------------------------------------------------------------
export function estimateFinishTime(enriched, flatPaceMinKm = 7, ascentCost = 1 / 32) {
  const s = computeStats(enriched);
  const baseMin   = s.totalDistKm * flatPaceMinKm;
  const ascentMin = s.elevationGainM * ascentCost;
  const totalMinutes = baseMin + ascentMin;
  return {
    totalMinutes,
    hours:   Math.floor(totalMinutes / 60),
    minutes: Math.round(totalMinutes % 60),
  };
}

// ---------------------------------------------------------------------------
// Per-climb estimated time (same two-parameter model, scoped to one segment)
// seg: one element from analyzeClimbs() output
// type: 'climb' | 'descent'
// ---------------------------------------------------------------------------
export function climbEstimatedTime(seg, type, flatPaceMinKm = 7) {
  const baseMin  = seg.lengthKm * flatPaceMinKm;
  const bonus    = type === 'climb' ? (seg.gainM ?? seg.eleDiffM) * (1 / 32) : 0;
  const total    = baseMin + bonus;
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return h > 0 ? `~${h}h ${m}m` : `~${m} min`;
}

// ---------------------------------------------------------------------------
// Overall race difficulty badge
// Based on ITRA km-effort thresholds:
//   ≤25 → easy  |  25–45 → moderate  |  45–75 → hard  |  >75 → extreme
// ---------------------------------------------------------------------------
export function raceDifficulty(itraKmEffort) {
  if (itraKmEffort <= 25) return 'easy';
  if (itraKmEffort <= 45) return 'moderate';
  if (itraKmEffort <= 75) return 'hard';
  return 'extreme';
}

// ---------------------------------------------------------------------------
// Runnable vs hikeable breakdown
// Runnable  : |grade| < 20%
// Hike      : grade ≥ 20% (uphills only — steep ups are the limiter)
// Returns { runnablePct, hikePct } (0-100)
// ---------------------------------------------------------------------------
export function runnableVsHike(enriched) {
  const withEle = enriched.filter(p => p.ele !== null);
  if (withEle.length < 2) return null;

  let runnable = 0;
  let hike = 0;

  for (let i = 1; i < withEle.length; i++) {
    const dEle  = withEle[i].ele  - withEle[i - 1].ele;
    const dDist = (withEle[i].dist - withEle[i - 1].dist) * 1000; // m
    if (dDist <= 0) continue;

    const gradPct = (dEle / dDist) * 100;
    // Only uphill steep sections force a hike; downhill and flat are runnable
    if (gradPct >= 20) hike += dDist;
    else               runnable += dDist;
  }

  const total = runnable + hike;
  if (total === 0) return null;
  return {
    runnablePct: (runnable / total) * 100,
    hikePct:     (hike     / total) * 100,
  };
}
