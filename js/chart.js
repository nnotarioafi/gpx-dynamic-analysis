/**
 * chart.js
 * Renders the elevation profile on a <canvas> element with:
 *  - Smooth polyline fill
 *  - Climb/descent band overlays
 *  - Hover crosshair with tooltip
 *  - Click-drag selection with live stats callback
 */

export class ElevationChart {
  constructor(canvas, onSelection) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelection = onSelection; // fn(fromKm, toKm) | null

    this.enriched = [];
    this.climbs = [];
    this.descents = [];

    // Chart margins
    this.margin = { top: 20, right: 20, bottom: 40, left: 60 };

    // Selection state
    this.sel = { active: false, startX: null, endX: null, dragging: false };

    // Hover state
    this.hoverX = null;

    // Cumulative overlay
    this.cumulativeData = null; // { dists[], cumGain[], cumLoss[] }
    this.showCumulative = false;

    this._bindEvents();
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------
  setData(enriched, climbs, descents) {
    this.enriched = enriched.filter(p => p.ele !== null);
    this.climbs = climbs;
    this.descents = descents;
    this.sel = { active: false, startX: null, endX: null, dragging: false };
    this.render();
  }

  setCumulativeData(data) {
    this.cumulativeData = data;
    this.render();
  }

  toggleCumulative() {
    this.showCumulative = !this.showCumulative;
    this.render();
    return this.showCumulative;
  }

  // -------------------------------------------------------------------------
  // Coordinate helpers
  // -------------------------------------------------------------------------
  get chartW() { return this.canvas.width - this.margin.left - this.margin.right; }
  get chartH() { return this.canvas.height - this.margin.top - this.margin.bottom; }

  _distToX(distKm) {
    const maxDist = this.enriched[this.enriched.length - 1]?.dist ?? 1;
    return this.margin.left + (distKm / maxDist) * this.chartW;
  }

  _eleToY(ele) {
    const eles = this.enriched.map(p => p.ele);
    const minEle = Math.min(...eles);
    const maxEle = Math.max(...eles);
    const range = maxEle - minEle || 1;
    const pad = range * 0.1;
    return this.margin.top + this.chartH - ((ele - (minEle - pad)) / (range + 2 * pad)) * this.chartH;
  }

  _xToDist(x) {
    const maxDist = this.enriched[this.enriched.length - 1]?.dist ?? 1;
    return ((x - this.margin.left) / this.chartW) * maxDist;
  }

  _clampX(x) {
    return Math.max(this.margin.left, Math.min(this.margin.left + this.chartW, x));
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  render() {
    const { canvas, ctx } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.enriched.length < 2) return;

    if (this.showCumulative && this.cumulativeData) {
      this._drawCumulativeGrid();
      this._drawAxes();
      this._drawCumulative();
    } else {
      this._drawElevationGrid();
      this._drawClimbBands();
      this._drawDescentBands();
      this._drawProfile();
      this._drawAxes();
    }
    this._drawSelection();
    if (this.hoverX !== null) this._drawCrosshair(this.hoverX);
  }

  _drawElevationGrid() {
    const { ctx } = this;
    const eles = this.enriched.map(p => p.ele);
    const minEle = Math.min(...eles);
    const maxEle = Math.max(...eles);
    const range = maxEle - minEle || 1;
    const pad = range * 0.1;
    const lo = minEle - pad;
    const hi = maxEle + pad;

    // Horizontal grid lines
    const step = niceStep(hi - lo, 5);
    const start = Math.ceil(lo / step) * step;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';

    for (let e = start; e <= hi; e += step) {
      const y = this._eleToY(e);
      ctx.beginPath();
      ctx.moveTo(this.margin.left, y);
      ctx.lineTo(this.margin.left + this.chartW, y);
      ctx.stroke();
      ctx.fillText(Math.round(e) + 'm', this.margin.left - 8, y + 4);
    }

    // Vertical grid lines (distance)
    const maxDist = this.enriched[this.enriched.length - 1].dist;
    const dStep = niceStep(maxDist, 6);
    ctx.textAlign = 'center';
    for (let d = 0; d <= maxDist; d += dStep) {
      const x = this._distToX(d);
      ctx.beginPath();
      ctx.moveTo(x, this.margin.top);
      ctx.lineTo(x, this.margin.top + this.chartH);
      ctx.stroke();
      ctx.fillText(d.toFixed(1) + 'km', x, this.margin.top + this.chartH + 18);
    }

    ctx.restore();
  }

  _drawCumulativeGrid() {
    const { ctx } = this;
    const { cumGain, cumLoss } = this.cumulativeData;
    const maxVal = Math.max(cumGain[cumGain.length - 1], cumLoss[cumLoss.length - 1], 1);
    const valToY = v => this.margin.top + this.chartH - (v / maxVal) * this.chartH;

    const step = niceStep(maxVal, 5);
    const maxDist = this.enriched[this.enriched.length - 1].dist;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';

    // Horizontal grid lines
    ctx.textAlign = 'right';
    for (let v = 0; v <= maxVal + step; v += step) {
      const y = valToY(v);
      if (y < this.margin.top - 2) break;
      ctx.beginPath();
      ctx.moveTo(this.margin.left, y);
      ctx.lineTo(this.margin.left + this.chartW, y);
      ctx.stroke();
      ctx.fillText(Math.round(v) + 'm', this.margin.left - 8, y + 4);
    }

    // Vertical grid lines (distance)
    const dStep = niceStep(maxDist, 6);
    ctx.textAlign = 'center';
    for (let d = 0; d <= maxDist; d += dStep) {
      const x = this._distToX(d);
      ctx.beginPath();
      ctx.moveTo(x, this.margin.top);
      ctx.lineTo(x, this.margin.top + this.chartH);
      ctx.stroke();
      ctx.fillText(d.toFixed(1) + 'km', x, this.margin.top + this.chartH + 18);
    }

    ctx.restore();
  }

  _drawClimbBands() {
    const { ctx } = this;
    ctx.save();
    for (const c of this.climbs) {
      const x1 = this._distToX(c.startDist);
      const x2 = this._distToX(c.endDist);
      ctx.fillStyle = 'rgba(255, 140, 0, 0.12)';
      ctx.fillRect(x1, this.margin.top, x2 - x1, this.chartH);
    }
    ctx.restore();
  }

  _drawDescentBands() {
    const { ctx } = this;
    ctx.save();
    for (const d of this.descents) {
      const x1 = this._distToX(d.startDist);
      const x2 = this._distToX(d.endDist);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
      ctx.fillRect(x1, this.margin.top, x2 - x1, this.chartH);
    }
    ctx.restore();
  }

  _drawProfile() {
    const { ctx } = this;
    const pts = this.enriched;
    const bottomY = this.margin.top + this.chartH;

    // Gradient fill (background area under the line)
    const grad = ctx.createLinearGradient(0, this.margin.top, 0, bottomY);
    grad.addColorStop(0, 'rgba(99, 210, 140, 0.30)');
    grad.addColorStop(1, 'rgba(99, 210, 140, 0.02)');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this._distToX(pts[0].dist), bottomY);
    ctx.lineTo(this._distToX(pts[0].dist), this._eleToY(pts[0].ele));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(this._distToX(pts[i].dist), this._eleToY(pts[i].ele));
    }
    ctx.lineTo(this._distToX(pts[pts.length - 1].dist), bottomY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Gradient-coloured profile line: colour each segment by gradient %
    // 0–5%: green, 5–10%: yellow, 10–15%: orange, >15%: red
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    for (let i = 1; i < pts.length; i++) {
      const dEle  = pts[i].ele  - pts[i - 1].ele;
      const dDist = (pts[i].dist - pts[i - 1].dist) * 1000; // m
      const gradPct = dDist > 0 ? Math.abs(dEle / dDist) * 100 : 0;

      ctx.beginPath();
      ctx.strokeStyle = gradientColor(gradPct);
      ctx.moveTo(this._distToX(pts[i - 1].dist), this._eleToY(pts[i - 1].ele));
      ctx.lineTo(this._distToX(pts[i].dist),     this._eleToY(pts[i].ele));
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawAxes() {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.margin.left, this.margin.top);
    ctx.lineTo(this.margin.left, this.margin.top + this.chartH);
    ctx.lineTo(this.margin.left + this.chartW, this.margin.top + this.chartH);
    ctx.stroke();
    ctx.restore();
  }

  _drawSelection() {
    const { sel, ctx } = this;
    if (!sel.active && sel.startX === null) return;

    const x1 = this._clampX(Math.min(sel.startX, sel.endX ?? sel.startX));
    const x2 = this._clampX(Math.max(sel.startX, sel.endX ?? sel.startX));

    ctx.save();
    // Overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x1, this.margin.top, x2 - x1, this.chartH);
    // Borders
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, this.margin.top);
    ctx.lineTo(x1, this.margin.top + this.chartH);
    ctx.moveTo(x2, this.margin.top);
    ctx.lineTo(x2, this.margin.top + this.chartH);
    ctx.stroke();
    ctx.restore();
  }

  _interpolateCumulative(distKm) {
    const { dists, cumGain, cumLoss } = this.cumulativeData;
    let i = dists.findIndex(d => d >= distKm);
    if (i <= 0) return { gain: cumGain[0] ?? 0, loss: cumLoss[0] ?? 0 };
    if (i >= dists.length) i = dists.length - 1;
    const t = (distKm - dists[i - 1]) / (dists[i] - dists[i - 1]);
    return {
      gain: cumGain[i - 1] + t * (cumGain[i] - cumGain[i - 1]),
      loss: cumLoss[i - 1] + t * (cumLoss[i] - cumLoss[i - 1]),
    };
  }

  _drawCrosshair(x) {
    if (x < this.margin.left || x > this.margin.left + this.chartW) return;
    const { ctx } = this;
    const distKm = this._xToDist(x);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, this.margin.top);
    ctx.lineTo(x, this.margin.top + this.chartH);
    ctx.stroke();

    if (this.showCumulative && this.cumulativeData) {
      // Cumulative mode: dot on gain line, tooltip shows gain + loss
      const { gain, loss } = this._interpolateCumulative(distKm);
      const maxVal = Math.max(
        this.cumulativeData.cumGain[this.cumulativeData.cumGain.length - 1],
        this.cumulativeData.cumLoss[this.cumulativeData.cumLoss.length - 1], 1
      );
      const valToY = v => this.margin.top + this.chartH - (v / maxVal) * this.chartH;
      const gainY = valToY(gain);
      const lossY = valToY(loss);

      // Dot on gain line
      ctx.beginPath();
      ctx.arc(x, gainY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#63d28c';
      ctx.fill();

      // Dot on loss line
      ctx.beginPath();
      ctx.arc(x, lossY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f87171';
      ctx.fill();

      // Tooltip anchored to gain dot
      const label = `${distKm.toFixed(2)} km  ↑ ${Math.round(gain)} m  ↓ ${Math.round(loss)} m`;
      ctx.font = '12px monospace';
      ctx.setLineDash([]);
      const tw = ctx.measureText(label).width + 12;
      let tx = x + 8;
      if (tx + tw > this.margin.left + this.chartW) tx = x - tw - 8;
      const ty = Math.min(gainY, lossY) - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(tx, ty - 14, tw, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, tx + 6, ty + 1);
    } else {
      // Elevation mode: dot on profile, tooltip shows distance + elevation
      const pt = this.enriched.reduce((best, p) =>
        Math.abs(p.dist - distKm) < Math.abs(best.dist - distKm) ? p : best
      );
      const py = this._eleToY(pt.ele);

      ctx.beginPath();
      ctx.arc(x, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      const label = `${pt.dist.toFixed(2)} km | ${Math.round(pt.ele)} m`;
      ctx.font = '12px monospace';
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const tw = ctx.measureText(label).width + 12;
      let tx = x + 8;
      if (tx + tw > this.margin.left + this.chartW) tx = x - tw - 8;
      ctx.fillRect(tx, py - 14, tw, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, tx + 6, py + 1);
    }

    ctx.restore();
  }

  _drawCumulative() {
    const { ctx } = this;
    const { dists, cumGain, cumLoss } = this.cumulativeData;
    if (!dists.length) return;

    const maxVal = Math.max(cumGain[cumGain.length - 1], cumLoss[cumLoss.length - 1], 1);

    // Map cumulative value to Y within chart area (top = maxVal, bottom = 0)
    const valToY = v => this.margin.top + this.chartH - (v / maxVal) * this.chartH;

    // Draw gain line (green)
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    ctx.strokeStyle = '#63d28c';
    for (let i = 0; i < dists.length; i++) {
      const x = this._distToX(dists[i]);
      const y = valToY(cumGain[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw loss line (red)
    ctx.beginPath();
    ctx.strokeStyle = '#f87171';
    for (let i = 0; i < dists.length; i++) {
      const x = this._distToX(dists[i]);
      const y = valToY(cumLoss[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Right-side axis labels for cumulative
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    const rightX = this.margin.left + this.chartW + 4;
    ctx.fillStyle = '#63d28c';
    ctx.fillText('↑' + Math.round(cumGain[cumGain.length - 1]) + 'm', rightX, valToY(cumGain[cumGain.length - 1]) + 3);
    ctx.fillStyle = '#f87171';
    ctx.fillText('↓' + Math.round(cumLoss[cumLoss.length - 1]) + 'm', rightX, valToY(cumLoss[cumLoss.length - 1]) + 3);

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown', e => this._onMouseDown(e));
    c.addEventListener('mousemove', e => this._onMouseMove(e));
    c.addEventListener('mouseup', e => this._onMouseUp(e));
    c.addEventListener('mouseleave', () => { this.hoverX = null; this.render(); });
    c.addEventListener('dblclick', () => this._clearSelection());

    // Touch support (basic)
    c.addEventListener('touchstart', e => { e.preventDefault(); this._onMouseDown(e.touches[0]); }, { passive: false });
    c.addEventListener('touchmove', e => { e.preventDefault(); this._onMouseMove(e.touches[0]); }, { passive: false });
    c.addEventListener('touchend', e => { this._onMouseUp(e.changedTouches[0]); }, { passive: false });
  }

  _relX(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    return (e.clientX - rect.left) * scaleX;
  }

  _onMouseDown(e) {
    const x = this._relX(e);
    this.sel = { active: false, startX: x, endX: x, dragging: true };
    this.render();
  }

  _onMouseMove(e) {
    const x = this._relX(e);
    this.hoverX = x;

    if (this.sel.dragging) {
      this.sel.endX = x;
      this.sel.active = true;
    }
    this.render();

    // Fire live selection callback
    if (this.sel.active && this.sel.dragging) {
      const from = this._xToDist(this._clampX(Math.min(this.sel.startX, this.sel.endX)));
      const to = this._xToDist(this._clampX(Math.max(this.sel.startX, this.sel.endX)));
      if (this.onSelection) this.onSelection(from, to);
    }
  }

  _onMouseUp(e) {
    if (!this.sel.dragging) return;
    const x = this._relX(e);
    this.sel.endX = x;
    this.sel.dragging = false;

    const from = this._xToDist(this._clampX(Math.min(this.sel.startX, this.sel.endX)));
    const to = this._xToDist(this._clampX(Math.max(this.sel.startX, this.sel.endX)));

    if (Math.abs(from - to) < 0.01) {
      this._clearSelection();
      return;
    }

    this.sel.active = true;
    this.render();
    if (this.onSelection) this.onSelection(from, to);
  }

  _clearSelection() {
    this.sel = { active: false, startX: null, endX: null, dragging: false };
    this.render();
    if (this.onSelection) this.onSelection(null, null);
  }

  // Call when container resizes
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.render();
  }

  // -------------------------------------------------------------------------
  // Second-track overlay (comparison mode)
  // -------------------------------------------------------------------------
  /**
   * Draw Track B as an orange line over the already-rendered Track A.
   * enrichedB: array of { ele, dist } points
   * Both tracks normalise to the full 0→chartW span so km 0 = start for both.
   * Uses a shared y-axis that covers both tracks' elevation range.
   * Only draws in standard (non-cumulative) mode.
   */
  drawSecondTrack(enrichedB) {
    if (!enrichedB || enrichedB.length < 2 || this.showCumulative) return;
    const { ctx } = this;
    const pts = enrichedB.filter(p => p.ele !== null);
    if (pts.length < 2) return;

    const maxDistB = pts[pts.length - 1].dist;

    // Expand y range to cover both tracks
    const elesA = this.enriched.map(p => p.ele);
    const elesB = pts.map(p => p.ele);
    const minEle = Math.min(...elesA, ...elesB);
    const maxEle = Math.max(...elesA, ...elesB);
    const range  = maxEle - minEle || 1;
    const pad    = range * 0.1;

    const yB = (ele) =>
      this.margin.top + this.chartH - ((ele - (minEle - pad)) / (range + 2 * pad)) * this.chartH;
    const xB = (dist) =>
      this.margin.left + (dist / maxDistB) * this.chartW;

    ctx.save();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)'; // --orange
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      i === 0 ? ctx.moveTo(xB(p.dist), yB(p.ele)) : ctx.lineTo(xB(p.dist), yB(p.ele));
    });
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Utility: pick a "nice" step size for axis ticks
// ---------------------------------------------------------------------------
function niceStep(range, targetTicks) {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  if (residual < 1.5) return mag;
  if (residual < 3.5) return 2 * mag;
  if (residual < 7.5) return 5 * mag;
  return 10 * mag;
}

// ---------------------------------------------------------------------------
// Utility: map gradient % to a colour
//   0–5%   → green  (#63d28c)
//   5–10%  → yellow (#facc15)
//   10–15% → orange (#f97316)
//   >15%   → red    (#f87171)
// ---------------------------------------------------------------------------
function gradientColor(pct) {
  if (pct < 5)  return '#63d28c';
  if (pct < 10) return '#facc15';
  if (pct < 15) return '#f97316';
  return '#f87171';
}
