// src/utils/geo.js
// ---------------------------------------------------------------------------
// Geospatial utilities for the vehicle-path app.
// Uses Turf.js for distance math (haversine-based, accurate for short distances).
// ---------------------------------------------------------------------------

import {
  point,
  lineString,
  pointToLineDistance,
  distance as turfDistance,
} from '@turf/turf';

/**
 * Convert [lat, lng] to the [lng, lat] order Turf expects.
 * GeoJSON uses [lng, lat]; most of our data is stored as { latitude, longitude }.
 */
const toLngLat = (latitude, longitude) => [longitude, latitude];

/**
 * Total distance traveled along the path, in kilometers.
 *
 * Skips pairs of points where the vehicle didn't move (identical coords),
 * so stationary periods at the same GPS position don't add phantom meters.
 *
 * @param {Array<{latitude:number, longitude:number}>} path
 * @returns {number} distance in km
 */
export function totalDistanceKm(path) {
  if (!path || path.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];

    // Skip stationary duplicates (same lat/lng) — no movement, no distance.
    if (prev.latitude === curr.latitude && prev.longitude === curr.longitude) {
      continue;
    }

    total += turfDistance(
      toLngLat(prev.latitude, prev.longitude),
      toLngLat(curr.latitude, curr.longitude),
      { units: 'kilometers' }
    );
  }
  return total;
}

/**
 * Highest speed recorded during the trip, in km/h (as provided by the data).
 * @param {Array<{speed:number}>} path
 * @returns {number}
 */
export function maxSpeed(path) {
  if (!path || path.length === 0) return 0;
  return path.reduce((max, p) => (p.speed > max ? p.speed : max), 0);
}

/**
 * Build a Turf LineString from an array of {latitude, longitude} points.
 */
function buildLine(path) {
  return lineString(path.map((p) => toLngLat(p.latitude, p.longitude)));
}

/**
 * Find the store closest to the vehicle's path.
 *
 * For each store, we measure the shortest distance from the store point to
 * the polyline representing the vehicle's path. The store with the smallest
 * such distance is "closest to the path".
 *
 * @param {Array<{name:string, latitude:number, longitude:number}>} stores
 * @param {Array<{latitude:number, longitude:number}>} path
 * @returns {{store:object, distanceKm:number}|null}
 */
export function findClosestStore(stores, path) {
  if (!stores?.length || !path?.length) return null;

  const line = buildLine(path);
  let best = null;

  for (const store of stores) {
    const storePoint = point(toLngLat(store.latitude, store.longitude));
    const distKm = pointToLineDistance(storePoint, line, {
      units: 'kilometers',
    });

    if (!best || distKm < best.distanceKm) {
      best = { store, distanceKm: distKm };
    }
  }

  return best;
}

/**
 * Find the first time the vehicle came within `thresholdKm` of a target point.
 *
 * Walks the path in chronological order (as recorded) and returns the
 * timestamp of the first point whose distance to the target is <= threshold.
 *
 * @param {Array<{latitude:number, longitude:number, timeStamp:number}>} path
 * @param {{latitude:number, longitude:number}} target  (e.g. the closest store)
 * @param {number} thresholdKm  proximity threshold, default 0.5 km (500 m)
 * @returns {number|null} Unix timestamp (seconds) or null if never within range
 */
export function firstProximityTimestamp(path, target, thresholdKm = 0.5) {
  if (!path?.length || !target) return null;

  const targetPoint = toLngLat(target.latitude, target.longitude);

  for (const p of path) {
    const d = turfDistance(targetPoint, toLngLat(p.latitude, p.longitude), {
      units: 'kilometers',
    });
    if (d <= thresholdKm) {
      return p.timeStamp;
    }
  }
  return null;
}