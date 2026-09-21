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
 */
const toLngLat = (latitude, longitude) => [longitude, latitude];

/**
 * Speed thresholds (km/h) for the multi-colored path.
 * Each entry represents the upper bound of a color band.
 */
export const SPEED_BANDS = [
  { max: 10,       color: '#3b82f6', label: '0-10 km/h'   },
  { max: 30,       color: '#10b981', label: '10-30 km/h'  },
  { max: 50,       color: '#eab308', label: '30-50 km/h'  },
  { max: 70,       color: '#f97316', label: '50-70 km/h'  },
  { max: Infinity, color: '#ef4444', label: '70+ km/h'    },
];

/**
 * Return the color for a given speed (km/h) using SPEED_BANDS.
 */
export function speedColor(kmh) {
  for (const band of SPEED_BANDS) {
    if (kmh <= band.max) return band.color;
  }
  return SPEED_BANDS[SPEED_BANDS.length - 1].color;
}

/**
 * Total distance traveled along the path, in kilometers.
 * Skips stationary duplicate points.
 */
export function totalDistanceKm(path) {
  if (!path || path.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];

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
 * Highest speed recorded during the trip, in km/h.
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
 * Find the N closest stores to the vehicle's path, sorted by distance.
 */
export function findTopNClosestStores(stores, path, n = 5) {
  if (!stores?.length || !path?.length) return [];

  const line = buildLine(path);

  const scored = stores.map((store) => {
    const storePoint = point(toLngLat(store.latitude, store.longitude));
    const distKm = pointToLineDistance(storePoint, line, {
      units: 'kilometers',
    });
    return { store, distanceKm: distKm };
  });

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  return scored.slice(0, n);
}

/**
 * Find the first time the vehicle came within `thresholdKm` of a target point.
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