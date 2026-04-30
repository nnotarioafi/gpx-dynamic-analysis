/**
 * gpx-parser.js
 * Parses a GPX XML string and returns a structured track object.
 */

export function parseGPX(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid GPX file: ' + parseError.textContent);
  }

  const trkpts = Array.from(doc.querySelectorAll('trkpt'));
  if (trkpts.length === 0) {
    throw new Error('No track points found in GPX file.');
  }

  const points = trkpts.map(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const eleEl = pt.querySelector('ele');
    const ele = eleEl ? parseFloat(eleEl.textContent) : null;
    return { lat, lon, ele };
  });

  // Metadata
  const nameEl = doc.querySelector('trk > name');
  const name = nameEl ? nameEl.textContent.trim() : 'Unnamed Track';

  return { name, points };
}
