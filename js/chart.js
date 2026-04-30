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

    this._drawGrid();
    this._drawClimbBands();
    this._drawDescentBands();
    this._drawProfile();
    this._drawAxes();
    this._drawSelection();
    if (this.hoverX !== null) this._drawCrosshair(this.hoverX);
  }

  _drawGrid() {
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

    // Gradient fill
    const grad = ctx.createLinearGradient(0, this.margin.top, 0, bottomY);
    grad.addColorStop(0, 'rgba(99, 210, 140, 0.55)');
    grad.addColorStop(1, 'rgba(99, 210, 140, 0.04)');

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

    // Profile line
    ctx.beginPath();
    ctx.moveTo(this._distToX(pts[0].dist), this._eleToY(pts[0].ele));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(this._distToX(pts[i].dist), this._eleToY(pts[i].ele));
    }
    ctx.strokeStyle = '#63d28c';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
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

  _drawCrosshair(x) {
    if (x < this.margin.left || x > this.margin.left + this.chartW) return;
    const { ctx } = this;
    const distKm = this._xToDist(x);
    // Find closest point
    const pt = this.enriched.reduce((best, p) => {
      return Math.abs(p.dist - distKm) < Math.abs(best.dist - distKm) ? p : best;
    });
    const py = this._eleToY(pt.ele);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, this.margin.top);
    ctx.lineTo(x, this.margin.top + this.chartH);
    ctx.stroke();

    // Dot on profile
    ctx.beginPath();
    ctx.arc(x, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Tooltip
    const label = `${pt.dist.toFixed(2)} km | ${Math.round(pt.ele)} m`;
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const tw = ctx.measureText(label).width + 12;
    let tx = x + 8;
    if (tx + tw > this.margin.left + this.chartW) tx = x - tw - 8;
    ctx.fillRect(tx, py - 14, tw, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, tx + 6, py + 1);
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
