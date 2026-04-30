/**
 * ui.js
 * Wires together all modules: file upload, stats panel, climbs panel, chart.
 * Supports EN/ES localisation via i18n.js.
 */

import { parseGPX } from './gpx-parser.js';
import { enrichPoints, computeStats, analyzeClimbs, selectionStats, terrainDistribution, steepestSections, perKmSplits, cumulativeGainLoss } from './track-analysis.js';
import { ElevationChart } from './chart.js';
import { t, getLocale, setLocale, initLocale } from './i18n.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let enriched = [];
let chart = null;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const dropZone        = document.getElementById('drop-zone');
const fileInput       = document.getElementById('file-input');
const trackName       = document.getElementById('track-name');
const statsGrid       = document.getElementById('stats-grid');
const climbsList      = document.getElementById('climbs-list');
const descentsList    = document.getElementById('descents-list');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue  = document.getElementById('threshold-value');
const analysisSection = document.getElementById('analysis-section');
const selectionPanel  = document.getElementById('selection-panel');
const canvas          = document.getElementById('elevation-canvas');
const climbsCount     = document.getElementById('climbs-count');
const descentsCount   = document.getElementById('descents-count');
const langToggle      = document.getElementById('lang-toggle');

// ---------------------------------------------------------------------------
// i18n — init, toggle, re-apply on change
// ---------------------------------------------------------------------------
initLocale();
applyTranslations();

langToggle.addEventListener('click', () => {
  const next = getLocale() === 'en' ? 'es' : 'en';
  setLocale(next);
});

document.addEventListener('localechange', () => {
  applyTranslations();
  // Re-render dynamic sections if a file is loaded
  if (enriched.length) {
    renderStats();
    renderTerrain();
    renderSteepest();
    renderSplits();
    renderClimbs();
  }
  renderSamples();
});

function applyTranslations() {
  const lang = getLocale();

  // <html lang>
  document.documentElement.lang = lang;

  // Browser tab + header logo
  document.title = t('appTitle');
  const titleEl = document.getElementById('app-title-text');
  if (titleEl) titleEl.textContent = t('appTitle');

  // Lang toggle shows the OTHER language
  langToggle.textContent = lang === 'en' ? 'ES' : 'EN';

  // Load GPX button
  const loadText = document.getElementById('load-gpx-text');
  if (loadText) loadText.textContent = t('loadGpx');

  // Upload area
  const uploadTitle = document.getElementById('upload-title');
  if (uploadTitle) uploadTitle.textContent = t('dropTitle');
  const uploadSub = document.getElementById('upload-sub');
  if (uploadSub) uploadSub.innerHTML = t('dropSub');

  // Sample picker heading
  const spTitle = document.getElementById('sample-picker-title');
  if (spTitle) spTitle.textContent = t('samplePickerTitle');

  // Loading overlay
  const loadingText = document.getElementById('loading-text');
  if (loadingText) loadingText.textContent = t('analyzingTrack');

  // Chart panel
  const chartTitle = document.getElementById('chart-panel-title');
  if (chartTitle) chartTitle.textContent = t('elevationProfile');

  const cumBtn = document.getElementById('cumulative-toggle');
  if (cumBtn) {
    cumBtn.textContent = (chart?.showCumulative) ? t('hideCumulative') : t('showCumulative');
  }

  const chartHint = document.getElementById('chart-hint');
  if (chartHint) chartHint.textContent = t('dragHint');

  const legendClimb = document.getElementById('legend-climb');
  if (legendClimb) legendClimb.textContent = t('climbZone');
  const legendDescent = document.getElementById('legend-descent');
  if (legendDescent) legendDescent.textContent = t('descentZone');
  const legendSlope = document.getElementById('legend-slope');
  if (legendSlope) legendSlope.textContent = t('slopeLabel');

  // Selection panel static labels
  const selLabel = document.getElementById('sel-label');
  if (selLabel) selLabel.textContent = t('selectionLabel');
  setText('sel-distance-label', t('selDistance'));
  setText('sel-gain-label',     t('selGain'));
  setText('sel-loss-label',     t('selLoss'));
  setText('sel-ascent-label',   t('selAscentRate'));
  setText('sel-descent-label',  t('selDescentRate'));

  // Stats panel
  setText('stats-panel-title',   t('trackStats'));

  // Climbs panel
  setText('climbs-panel-title',  t('climbsDescents'));
  setText('threshold-label-text', t('mergeThreshold'));
  setText('threshold-hint',      t('fewerHills'));
  setText('climbs-header-text',  t('climbsHeader'));
  setText('descents-header-text', t('descentsHeader'));

  // Terrain, Steepest, Splits panel titles
  setText('terrain-panel-title',  t('terrainDist'));
  setText('steepest-panel-title', t('steepestSections'));
  setText('splits-panel-title',   t('perKmSplits'));
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------------------
// Sample picker
// ---------------------------------------------------------------------------
async function loadSamplesManifest() {
  try {
    const res = await fetch('samples/index.json');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

let samplesData = [];

async function initSamplePicker() {
  samplesData = await loadSamplesManifest();
  renderSamples();
}

function renderSamples() {
  const list = document.getElementById('sample-list');
  if (!list) return;
  const lang = getLocale();

  if (!samplesData.length) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = samplesData.map(s => `
    <button class="sample-btn" data-file="${s.file}" type="button">
      <span class="sample-name">${lang === 'es' ? s.name_es : s.name_en}</span>
      <span class="sample-desc">${lang === 'es' ? s.description_es : s.description_en}</span>
    </button>
  `).join('');

  list.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => loadSampleFile(btn.dataset.file));
  });
}

async function loadSampleFile(filePath) {
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`Could not fetch ${filePath}`);
    const text = await res.text();
    const filename = filePath.split('/').pop();
    processGPX(text, filename);
  } catch (err) {
    showError(err.message);
  }
}

// ---------------------------------------------------------------------------
// Upload / Drop
// ---------------------------------------------------------------------------
dropZone.addEventListener('click', e => {
  // Don't trigger file input when clicking sample buttons
  if (e.target.closest('.sample-btn')) return;
  fileInput.click();
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      processGPX(e.target.result, file.name);
    } catch (err) {
      showError(err.message);
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------
function processGPX(xmlString, filename) {
  const gpx = parseGPX(xmlString);
  enriched = enrichPoints(gpx.points);

  trackName.textContent = gpx.name !== 'Unnamed Track' ? gpx.name : filename.replace('.gpx', '');

  // Unhide section FIRST so the canvas container has a real clientWidth
  analysisSection.classList.remove('hidden');
  dropZone.classList.add('loaded');

  // Show loading overlay, defer heavy rendering so browser paints it
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('hidden');

  requestAnimationFrame(() => {
    setTimeout(() => {
      renderStats();
      renderTerrain();
      renderSteepest();
      renderSplits();
      renderClimbs();
      initChart();
      overlay.classList.add('hidden');
    }, 0);
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function renderStats() {
  const s = computeStats(enriched);
  const netSign = s.netElevationM > 0 ? '+' : '';
  const cards = [
    { label: t('labelDistance'), value: s.totalDistKm.toFixed(2), unit: t('unitKm') },
    { label: t('labelItra'),     value: s.itraKmEffort.toFixed(1), unit: t('unitKme'), accent: 'itra' },
    { label: t('labelGain'),     value: Math.round(s.elevationGainM), unit: t('unitM'), accent: 'gain' },
    { label: t('labelLoss'),     value: Math.round(s.elevationLossM), unit: t('unitM'), accent: 'loss' },
    { label: t('labelMaxEle'),   value: s.maxElevationM !== null ? Math.round(s.maxElevationM) : '—', unit: s.maxElevationM !== null ? t('unitM') : '' },
    { label: t('labelMinEle'),   value: s.minElevationM !== null ? Math.round(s.minElevationM) : '—', unit: s.minElevationM !== null ? t('unitM') : '' },
    { label: t('labelNetEle'),   value: s.netElevationM !== null ? netSign + Math.round(s.netElevationM) : '—', unit: s.netElevationM !== null ? t('unitM') : '', accent: s.netElevationM > 0 ? 'gain' : s.netElevationM < 0 ? 'loss' : '' },
    { label: t('labelPoints'),   value: s.pointCount.toLocaleString(), unit: t('unitPts') },
  ];

  statsGrid.innerHTML = cards.map(c => `
    <div class="stat-card ${c.accent ? 'stat-card--' + c.accent : ''}">
      <span class="stat-label">${c.label}</span>
      <span class="stat-value">${c.value}<span class="stat-unit">${c.unit}</span></span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Threshold slider — fill indicator + label update
// ---------------------------------------------------------------------------
function updateSliderFill() {
  const min = parseInt(thresholdSlider.min, 10);
  const max = parseInt(thresholdSlider.max, 10);
  const val = parseInt(thresholdSlider.value, 10);
  const pct = ((val - min) / (max - min)) * 100;
  thresholdSlider.style.setProperty('--pct', pct.toFixed(1) + '%');
  thresholdValue.textContent = val + ' m';
}

thresholdSlider.addEventListener('input', () => {
  updateSliderFill();
  renderClimbs();
});

updateSliderFill();

// ---------------------------------------------------------------------------
// Climbs
// ---------------------------------------------------------------------------
function renderClimbs() {
  const threshold = parseInt(thresholdSlider.value, 10);
  const { climbs, descents } = analyzeClimbs(enriched, threshold);

  climbsCount.textContent = climbs.length;
  descentsCount.textContent = descents.length;

  climbsList.innerHTML = climbs.length
    ? climbs.map((c, i) => climbCard(c, i + 1, 'climb')).join('')
    : `<p class="empty-msg">${t('noClimbs')}</p>`;

  descentsList.innerHTML = descents.length
    ? descents.map((c, i) => climbCard(c, i + 1, 'descent')).join('')
    : `<p class="empty-msg">${t('noDescents')}</p>`;

  if (chart) {
    chart.setData(enriched, climbs, descents);
  }
}

function difficultyBadge(avgGrad) {
  if (avgGrad < 5)  return `<span class="difficulty-badge difficulty-badge--easy">${t('diffEasy')}</span>`;
  if (avgGrad < 10) return `<span class="difficulty-badge difficulty-badge--moderate">${t('diffModerate')}</span>`;
  if (avgGrad < 15) return `<span class="difficulty-badge difficulty-badge--hard">${t('diffHard')}</span>`;
  return `<span class="difficulty-badge difficulty-badge--extreme">${t('diffExtreme')}</span>`;
}

function climbCard(seg, n, type) {
  const isClimb = type === 'climb';
  const arrow     = isClimb ? '▲' : '▼';
  const colorClass = isClimb ? 'climb-card--up' : 'climb-card--down';
  const eleLabel  = isClimb ? t('gainLabel') : t('lossLabel');
  const eleVal    = isClimb ? Math.round(seg.gainM ?? seg.eleDiffM) : Math.round(seg.lossM ?? seg.eleDiffM);

  return `
    <div class="climb-card ${colorClass}">
      <div class="climb-header">
        <span class="climb-num">${arrow} #${n}</span>
        ${difficultyBadge(seg.avgGradientPct)}
        <span class="climb-range">${seg.startDist.toFixed(1)} – ${seg.endDist.toFixed(1)} km</span>
      </div>
      <div class="climb-stats">
        <span>${eleLabel}: <strong>${eleVal} m</strong></span>
        <span>${t('lengthLabel')}: <strong>${seg.lengthKm.toFixed(2)} km</strong></span>
        <span>${t('avgLabel')}: <strong>${seg.avgGradientPct.toFixed(1)}%</strong></span>
        <span>${t('maxLabel')}: <strong>${seg.maxGradientPct.toFixed(1)}%</strong></span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Terrain distribution bar
// ---------------------------------------------------------------------------
function renderTerrain() {
  const td = terrainDistribution(enriched);
  const el = document.getElementById('terrain-bar');
  if (!td || !el) return;

  const segments = [
    { key: 'steepDown', labelKey: 'steepDown', pct: td.steepDown, cls: 'steep-down' },
    { key: 'modDown',   labelKey: 'modDown',   pct: td.modDown,   cls: 'mod-down' },
    { key: 'flat',      labelKey: 'flat',       pct: td.flat,      cls: 'flat' },
    { key: 'modUp',     labelKey: 'modUp',      pct: td.modUp,     cls: 'mod-up' },
    { key: 'steepUp',   labelKey: 'steepUp',    pct: td.steepUp,   cls: 'steep-up' },
  ];

  el.innerHTML = `
    <div class="terrain-bar-track">
      ${segments.filter(s => s.pct > 0.5).map(s =>
        `<div class="terrain-seg terrain-seg--${s.cls}" style="flex:${s.pct}" title="${t(s.labelKey)}: ${s.pct.toFixed(1)}%">
          ${s.pct > 6 ? s.pct.toFixed(0) + '%' : ''}
        </div>`
      ).join('')}
    </div>
    <div class="terrain-legend">
      ${segments.map(s =>
        `<span class="terrain-legend-item"><span class="terrain-dot terrain-dot--${s.cls}"></span>${t(s.labelKey)} ${s.pct.toFixed(1)}%</span>`
      ).join('')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Steepest sections
// ---------------------------------------------------------------------------
function renderSteepest() {
  const sections = steepestSections(enriched);
  const el = document.getElementById('steepest-list');
  if (!el || !sections.length) return;

  el.innerHTML = sections.map(s => {
    const arrow = s.direction === 'up' ? '▲' : '▼';
    const cls   = s.direction === 'up' ? 'steep-card--up' : 'steep-card--down';
    return `
      <div class="steep-card ${cls}">
        <span class="steep-window">${s.windowM}m</span>
        <span class="steep-grad">${s.gradientPct.toFixed(1)}%</span>
        <span class="steep-elev">${arrow} ${Math.round(Math.abs(s.elevChangeM))}m</span>
        <span class="steep-range">${s.startDist.toFixed(2)}–${s.endDist.toFixed(2)} km</span>
      </div>
    `;
  }).join('');
}

// ---------------------------------------------------------------------------
// Per-km splits table
// ---------------------------------------------------------------------------
function renderSplits() {
  const splits = perKmSplits(enriched);
  const body = document.getElementById('splits-body');
  if (!body || !splits.length) return;

  body.innerHTML = `
    <table class="splits-table">
      <thead>
        <tr>
          <th>${t('colKm')}</th>
          <th>${t('colGain')}</th>
          <th>${t('colLoss')}</th>
          <th>${t('colMin')}</th>
          <th>${t('colMax')}</th>
          <th>${t('colAvg')}</th>
        </tr>
      </thead>
      <tbody>
        ${splits.map(s => {
          const gradCls = Math.abs(s.avgGrad) > 10 ? 'steep' : Math.abs(s.avgGrad) > 5 ? 'moderate' : '';
          return `<tr class="${gradCls}">
            <td>${s.km}</td>
            <td class="gain-cell">${s.gain}</td>
            <td class="loss-cell">${s.loss}</td>
            <td>${s.minEle ?? '—'}</td>
            <td>${s.maxEle ?? '—'}</td>
            <td>${s.avgGrad.toFixed(1)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------
function initChart() {
  if (!chart) {
    chart = new ElevationChart(canvas, onChartSelection);

    const cumBtn = document.getElementById('cumulative-toggle');
    if (cumBtn) {
      cumBtn.addEventListener('click', () => {
        const on = chart.toggleCumulative();
        cumBtn.classList.toggle('active', on);
        cumBtn.textContent = on ? t('hideCumulative') : t('showCumulative');
      });
    }
  }
  resizeCanvas();
  const threshold = parseInt(thresholdSlider.value, 10);
  const { climbs, descents } = analyzeClimbs(enriched, threshold);
  chart.setData(enriched, climbs, descents);

  const cumData = cumulativeGainLoss(enriched);
  chart.setCumulativeData(cumData);
}

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = Math.max(260, Math.round(container.clientWidth * 0.28));
  if (chart) chart.resize(canvas.width, canvas.height);
}

window.addEventListener('resize', () => {
  if (enriched.length) resizeCanvas();
});

// ---------------------------------------------------------------------------
// Selection stats
// ---------------------------------------------------------------------------
function onChartSelection(fromKm, toKm) {
  if (fromKm === null) {
    selectionPanel.classList.add('hidden');
    return;
  }

  const stats = selectionStats(enriched, fromKm, toKm);
  if (!stats) {
    selectionPanel.classList.add('hidden');
    return;
  }

  document.getElementById('sel-distance').textContent = stats.distKm.toFixed(2) + ' km';
  document.getElementById('sel-gain').textContent = Math.round(stats.gainM) + ' m';
  document.getElementById('sel-loss').textContent = Math.round(stats.lossM) + ' m';
  document.getElementById('sel-ascent-rate').textContent =
    stats.avgAscentRateMpKm.toFixed(1) + ' m/km (' + stats.avgAscentPct.toFixed(1) + '%)';
  document.getElementById('sel-descent-rate').textContent =
    stats.avgDescentRateMpKm.toFixed(1) + ' m/km (' + stats.avgDescentPct.toFixed(1) + '%)';
  document.getElementById('sel-range').textContent =
    fromKm.toFixed(2) + ' – ' + toKm.toFixed(2) + ' km';

  selectionPanel.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
initSamplePicker();
