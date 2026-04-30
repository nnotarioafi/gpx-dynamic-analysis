/**
 * i18n.js
 * Minimal locale system for EN / ES.
 * Usage:
 *   import { t, initLocale, setLocale } from './i18n.js';
 *   initLocale();              // call once on startup
 *   t('loadGpx')               // → "Load GPX" or "Cargar GPX"
 *   setLocale('es')            // switch at runtime
 */

const locales = {
  en: {
    // App shell
    appTitle:      'GPX Dynamic Analysis',
    loadGpx:       'Load GPX',
    dropTitle:     'Drop your GPX file here',
    dropSub:       'or click <strong>Load GPX</strong> in the header',
    analyzingTrack: 'Analyzing track…',

    // Sample picker
    samplePickerTitle: 'Or try a sample route',
    samplePickerBtn:   'Load sample',

    // Chart panel
    elevationProfile: 'Elevation Profile',
    showCumulative:   'Show cumulative ↑↓',
    hideCumulative:   'Hide cumulative ↑↓',
    dragHint:         'Drag to select a range\u00a0·\u00a0Double-click to clear',
    climbZone:        'Climb zone',
    descentZone:      'Descent zone',
    slopeLabel:       'Slope: flat → moderate → steep → extreme',

    // Selection panel
    selectionLabel:  'Selection:',
    selDistance:     'Distance',
    selGain:         '▲ Gain',
    selLoss:         '▼ Loss',
    selAscentRate:   'Avg Ascent Rate',
    selDescentRate:  'Avg Descent Rate',

    // Stats panel
    trackStats:    'Track Statistics',
    labelDistance: 'Distance',
    labelItra:     'ITRA Km-Effort',
    labelGain:     'Elevation Gain',
    labelLoss:     'Elevation Loss',
    labelMaxEle:   'Max Elevation',
    labelMinEle:   'Min Elevation',
    labelNetEle:   'Net Elevation',
    unitKm:  'km',
    unitKme: 'km-e',
    unitM:   'm',

    // Climbs panel
    climbsDescents:  'Climbs & Descents Analysis',
    mergeThreshold:  'Merge threshold',
    fewerHills:      'Higher → fewer hills',
    climbsHeader:    'Climbs',
    descentsHeader:  'Descents',
    noClimbs:        'No climbs detected at this threshold.',
    noDescents:      'No descents detected at this threshold.',

    // Difficulty badges
    diffEasy:     'Easy',
    diffModerate: 'Moderate',
    diffHard:     'Hard',
    diffExtreme:  'Extreme',

    // Climb card inline labels
    gainLabel:   'Gain',
    lossLabel:   'Loss',
    lengthLabel: 'Length',
    avgLabel:    'Avg',
    maxLabel:    'Max',

    // Terrain distribution
    terrainDist: 'Terrain Distribution',
    steepDown:   'Steep ↓',
    modDown:     'Mod ↓',
    flat:        'Flat',
    modUp:       'Mod ↑',
    steepUp:     'Steep ↑',

    // Steepest sections
    steepestSections: 'Steepest Sections',

    // Per-km splits
    perKmSplits: 'Per-Km Splits',
    colKm:       'Km',
    colGain:     '↑ Gain',
    colLoss:     '↓ Loss',
    colMin:      'Min',
    colMax:      'Max',
    colAvg:      'Avg grade',
    splitsLegendSteep:    'Steep (|avg| > 10%)',
    splitsLegendModerate: 'Moderate (5–10%)',
    copyLink:    'Copy link',
    linkCopied:  'Copied!',

    // Finish time estimate
    labelEstTime:      'Est. Finish Time',
    refRaceLabel:      'Based on your',
    refDistUnit:       'km race in',
    refHoursUnit:      'h',
    refMinsUnit:       'min',
    derivedPaceLabel:  '→ Trail pace:',
    unitMinKm:         'min/km',

    // Runnable vs hike
    runnableHikeTitle: 'Runnable vs Hike',
    runnableLabel: 'Runnable',
    hikeLabel:     'Hike (≥20% grade)',

    // Per-climb time
    estTimeLabel: 'Est. time',

    // Track comparison
    compareBtn:       'Compare +',
    clearCompare:     'Clear comparison',
    comparisonTitle:  'Track Comparison',
    trackALabel:      'Track A',
    trackBLabel:      'Track B',
    vsLabel:          'vs',
    noCompareTrack:   'Load a second track to compare',
    colAGain:         'A ↑',
    colALoss:         'A ↓',
    colAAvg:          'A grade',
    colBGain:         'B ↑',
    colBLoss:         'B ↓',
    colBAvg:          'B grade',
  },

  es: {
    // App shell
    appTitle:      'GPX Análisis Dinámico',
    loadGpx:       'Cargar GPX',
    dropTitle:     'Suelta tu archivo GPX aquí',
    dropSub:       'o haz clic en <strong>Cargar GPX</strong> en la cabecera',
    analyzingTrack: 'Analizando ruta…',

    // Sample picker
    samplePickerTitle: 'O prueba una ruta de ejemplo',
    samplePickerBtn:   'Cargar ejemplo',

    // Chart panel
    elevationProfile: 'Perfil de Elevación',
    showCumulative:   'Mostrar acumulado ↑↓',
    hideCumulative:   'Ocultar acumulado ↑↓',
    dragHint:         'Arrastra para seleccionar\u00a0·\u00a0Doble clic para borrar',
    climbZone:        'Zona de subida',
    descentZone:      'Zona de bajada',
    slopeLabel:       'Pendiente: llano → moderado → inclinado → extremo',

    // Selection panel
    selectionLabel:  'Selección:',
    selDistance:     'Distancia',
    selGain:         '▲ Subida',
    selLoss:         '▼ Bajada',
    selAscentRate:   'Tasa media de subida',
    selDescentRate:  'Tasa media de bajada',

    // Stats panel
    trackStats:    'Estadísticas de Ruta',
    labelDistance: 'Distancia',
    labelItra:     'ITRA Km-Esfuerzo',
    labelGain:     'Desnivel positivo',
    labelLoss:     'Desnivel negativo',
    labelMaxEle:   'Altitud máxima',
    labelMinEle:   'Altitud mínima',
    labelNetEle:   'Desnivel neto',
    unitKm:  'km',
    unitKme: 'km-e',
    unitM:   'm',

    // Climbs panel
    climbsDescents:  'Análisis de Subidas y Bajadas',
    mergeThreshold:  'Umbral de fusión',
    fewerHills:      'Mayor → menos segmentos',
    climbsHeader:    'Subidas',
    descentsHeader:  'Bajadas',
    noClimbs:        'No se detectaron subidas con este umbral.',
    noDescents:      'No se detectaron bajadas con este umbral.',

    // Difficulty badges
    diffEasy:     'Fácil',
    diffModerate: 'Moderado',
    diffHard:     'Duro',
    diffExtreme:  'Extremo',

    // Climb card inline labels
    gainLabel:   'Subida',
    lossLabel:   'Bajada',
    lengthLabel: 'Longitud',
    avgLabel:    'Media',
    maxLabel:    'Máx',

    // Terrain distribution
    terrainDist: 'Distribución del Terreno',
    steepDown:   'Muy inclinado ↓',
    modDown:     'Mod ↓',
    flat:        'Llano',
    modUp:       'Mod ↑',
    steepUp:     'Muy inclinado ↑',

    // Steepest sections
    steepestSections: 'Tramos con más inclinación',

    // Per-km splits
    perKmSplits: 'Parciales por Km',
    colKm:       'Km',
    colGain:     '↑ Subida',
    colLoss:     '↓ Bajada',
    colMin:      'Mín',
    colMax:      'Máx',
    colAvg:      'Pend. media',
    splitsLegendSteep:    'Inclinado (|media| > 10%)',
    splitsLegendModerate: 'Moderado (5–10%)',
    copyLink:    'Copiar enlace',
    linkCopied:  '¡Copiado!',

    // Finish time estimate
    labelEstTime:      'Tiempo estimado',
    refRaceLabel:      'Basado en tu',
    refDistUnit:       'km en',
    refHoursUnit:      'h',
    refMinsUnit:       'min',
    derivedPaceLabel:  '→ Ritmo trail:',
    unitMinKm:         'min/km',

    // Runnable vs hike
    runnableHikeTitle: 'Corre vs Caminar',
    runnableLabel: 'Correr',
    hikeLabel:     'Caminar (≥20% pend.)',

    // Per-climb time
    estTimeLabel: 'Tiempo estimado',

    // Track comparison
    compareBtn:       'Comparar +',
    clearCompare:     'Limpiar comparación',
    comparisonTitle:  'Comparación de Rutas',
    trackALabel:      'Ruta A',
    trackBLabel:      'Ruta B',
    vsLabel:          'vs',
    noCompareTrack:   'Carga una segunda ruta para comparar',
    colAGain:         'A ↑',
    colALoss:         'A ↓',
    colAAvg:          'A pend.',
    colBGain:         'B ↑',
    colBLoss:         'B ↓',
    colBAvg:          'B pend.',
  },
};

const STORAGE_KEY = 'gpx-lang';
let _locale = 'en';

export function t(key) {
  return locales[_locale][key] ?? locales.en[key] ?? key;
}

export function getLocale() { return _locale; }

export function setLocale(lang) {
  if (!locales[lang]) return;
  _locale = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.dispatchEvent(new CustomEvent('localechange', { detail: { lang } }));
}

export function initLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && locales[saved]) {
    _locale = saved;
  } else {
    _locale = navigator.language?.startsWith('es') ? 'es' : 'en';
  }
  // Don't fire the event on init — caller applies translations directly
}
