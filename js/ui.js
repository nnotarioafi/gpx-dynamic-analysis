/**
 * ui.js
 * Wires together all modules: file upload, stats panel, climbs panel, chart.
 */

import { parseGPX } from './gpx-parser.js';
import { enrichPoints, computeStats, analyzeClimbs, selectionStats } from './track-analysis.js';
import { ElevationChart } from './chart.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let enriched = [];
let chart = null;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const trackName = document.getElementById('track-name');
const statsGrid = document.getElementById('stats-grid');
const climbsList = document.getElementById('climbs-list');
const descentsList = document.getElementById('descents-list');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue = document.getElementById('threshold-value');
const analysisSection = document.getElementById('analysis-section');
const selectionPanel = document.getElementById('selection-panel');
const canvas = document.getElementById('elevation-canvas');
const climbsCount = document.getElementById('climbs-count');
const descentsCount = document.getElementById('descents-count');

// ---------------------------------------------------------------------------
// Upload / Drop
// ---------------------------------------------------------------------------
dropZone.addEventListener('click', () => fileInput.click());

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

  renderStats();
  renderClimbs();
  initChart();
}

function renderStats() {
  const s = computeStats(enriched);

  const cards = [
    { label: 'Distance', value: s.totalDistKm.toFixed(2), unit: 'km' },
    { label: 'Elevation Gain', value: Math.round(s.elevationGainM), unit: 'm', accent: 'gain' },
    { label: 'Elevation Loss', value: Math.round(s.elevationLossM), unit: 'm', accent: 'loss' },
    { label: 'Max Elevation', value: s.maxElevationM !== null ? Math.round(s.maxElevationM) : '—', unit: s.maxElevationM !== null ? 'm' : '' },
    { label: 'Min Elevation', value: s.minElevationM !== null ? Math.round(s.minElevationM) : '—', unit: s.minElevationM !== null ? 'm' : '' },
    { label: 'Track Points', value: s.pointCount.toLocaleString(), unit: 'pts' },
  ];

  statsGrid.innerHTML = cards.map(c => `
    <div class="stat-card ${c.accent ? 'stat-card--' + c.accent : ''}">
      <span class="stat-label">${c.label}</span>
      <span class="stat-value">${c.value}<span class="stat-unit">${c.unit}</span></span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Climbs
// ---------------------------------------------------------------------------
thresholdSlider.addEventListener('input', () => {
  thresholdValue.textContent = thresholdSlider.value + ' m';
  renderClimbs();
});

function renderClimbs() {
  const threshold = parseInt(thresholdSlider.value, 10);
  const { climbs, descents } = analyzeClimbs(enriched, threshold);

  climbsCount.textContent = climbs.length;
  descentsCount.textContent = descents.length;

  climbsList.innerHTML = climbs.length
    ? climbs.map((c, i) => climbCard(c, i + 1, 'climb')).join('')
    : '<p class="empty-msg">No climbs detected at this threshold.</p>';

  descentsList.innerHTML = descents.length
    ? descents.map((c, i) => climbCard(c, i + 1, 'descent')).join('')
    : '<p class="empty-msg">No descents detected at this threshold.</p>';

  if (chart) {
    chart.setData(enriched, climbs, descents);
  }
}

function climbCard(seg, n, type) {
  const isClimb = type === 'climb';
  const arrow = isClimb ? '▲' : '▼';
  const colorClass = isClimb ? 'climb-card--up' : 'climb-card--down';
  const eleLabel = isClimb ? 'Gain' : 'Loss';
  const eleVal = isClimb ? Math.round(seg.gainM ?? seg.eleDiffM) : Math.round(seg.lossM ?? seg.eleDiffM);

  return `
    <div class="climb-card ${colorClass}">
      <div class="climb-header">
        <span class="climb-num">${arrow} #${n}</span>
        <span class="climb-range">${seg.startDist.toFixed(1)} – ${seg.endDist.toFixed(1)} km</span>
      </div>
      <div class="climb-stats">
        <span>${eleLabel}: <strong>${eleVal} m</strong></span>
        <span>Length: <strong>${seg.lengthKm.toFixed(2)} km</strong></span>
        <span>Avg: <strong>${seg.avgGradientPct.toFixed(1)}%</strong></span>
        <span>Max: <strong>${seg.maxGradientPct.toFixed(1)}%</strong></span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------
function initChart() {
  if (!chart) {
    chart = new ElevationChart(canvas, onChartSelection);
  }
  resizeCanvas();
  const threshold = parseInt(thresholdSlider.value, 10);
  const { climbs, descents } = analyzeClimbs(enriched, threshold);
  chart.setData(enriched, climbs, descents);
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
