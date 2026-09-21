<!-- src/components/MapView.vue -->
<!--
  Renders an OpenLayers map showing:
    - The vehicle's GPS path (single-color line OR multi-colored by speed)
    - All store locations (as markers)
    - The closest store highlighted differently
    - An animated vehicle marker at the current playback index
    - A legend box explaining colors
    - A toggle to switch between simple and speed-colored path
  Emits "feature-click" events when a path point or store marker is clicked.
-->
<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { LineString, Point } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Style, Stroke, Circle as CircleStyle, Fill } from 'ol/style';
import Overlay from 'ol/Overlay';
import { defaults as defaultControls } from 'ol/control';
import { SPEED_BANDS, speedColor } from '../utils/geo.js';

const props = defineProps({
  path: { type: Array, default: () => [] },
  stores: { type: Array, default: () => [] },
  closestStore: { type: Object, default: null },
  currentIndex: { type: Number, default: -1 },
  isPlaying: { type: Boolean, default: false },
});

const emit = defineEmits(['feature-click']);

const mapContainer = ref(null);
const tooltipEl = ref(null);
let map = null;
let overlay = null;
let pathSource = null;
let storesSource = null;
let vehicleSource = null;
let vehicleFeature = null;

/* Color mode: 'simple' = single blue line, 'speed' = multi-colored by speed */
const colorMode = ref('simple');

/* ------------------------------------------------------------------ */
/* Styles                                                            */
/* ------------------------------------------------------------------ */

const pathStyle = new Style({
  stroke: new Stroke({ color: '#3b82f6', width: 4 }),
});

const storeStyle = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: '#10b981' }),
    stroke: new Stroke({ color: '#ffffff', width: 2 }),
  }),
});

const closestStoreStyle = new Style({
  image: new CircleStyle({
    radius: 11,
    fill: new Fill({ color: '#ef4444' }),
    stroke: new Stroke({ color: '#ffffff', width: 3 }),
  }),
});

const vehicleStyle = new Style({
  image: new CircleStyle({
    radius: 9,
    fill: new Fill({ color: '#8b5cf6' }),
    stroke: new Stroke({ color: '#ffffff', width: 3 }),
  }),
  zIndex: 10,
});

/* Bigger invisible hit targets for hover (radius 14px instead of 6px) */
const hoverPointStyle = new Style({
  image: new CircleStyle({
    radius: 14,
    fill: new Fill({ color: 'transparent' }),
  }),
});

/* ------------------------------------------------------------------ */
/* Build features                                                     */
/* ------------------------------------------------------------------ */

function buildPathFeatures(path) {
  if (!path?.length) return [];

  const coords = path.map((p) => fromLonLat([p.longitude, p.latitude]));
  const lineFeature = new Feature({
    geometry: new LineString(coords),
    kind: 'path',
  });
  lineFeature.setStyle(pathStyle);

  const hoverPoints = path.map((p, idx) => {
    const f = new Feature({
      geometry: new Point(fromLonLat([p.longitude, p.latitude])),
      kind: 'path-point',
      data: p,
      index: idx,
    });
    f.setStyle(hoverPointStyle);
    return f;
  });

  return [lineFeature, ...hoverPoints];
}

function buildSpeedSegments(path) {
  if (!path?.length || path.length < 2) return [];

  const features = [];

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];

    if (prev.latitude === curr.latitude && prev.longitude === curr.longitude) {
      continue;
    }

    const segment = new Feature({
      geometry: new LineString([
        fromLonLat([prev.longitude, prev.latitude]),
        fromLonLat([curr.longitude, curr.latitude]),
      ]),
      kind: 'path',
    });

    segment.setStyle(
      new Style({
        stroke: new Stroke({
          color: speedColor(curr.speed),
          width: 4,
        }),
      })
    );

    features.push(segment);
  }

  return features;
}

function buildHoverPoints(path) {
  return path.map((p, idx) => {
    const f = new Feature({
      geometry: new Point(fromLonLat([p.longitude, p.latitude])),
      kind: 'path-point',
      data: p,
      index: idx,
    });
    f.setStyle(hoverPointStyle);
    return f;
  });
}

function buildStoreFeatures(stores, closestStore) {
  if (!stores?.length) return [];

  const closestName = closestStore?.store?.name;

  return stores.map((s) => {
    const isClosest = s.name === closestName;
    const f = new Feature({
      geometry: new Point(fromLonLat([s.longitude, s.latitude])),
      kind: isClosest ? 'closest-store' : 'store',
      data: s,
    });
    f.setStyle(isClosest ? closestStoreStyle : storeStyle);
    return f;
  });
}

function updateVehicleFeature() {
  if (!map) return;

  const idx = props.currentIndex;
  const validIndex = idx >= 0 && idx < props.path.length;

  if (!validIndex) {
    if (vehicleFeature) vehicleFeature.setGeometry(undefined);
    return;
  }

  const p = props.path[idx];
  const coord = fromLonLat([p.longitude, p.latitude]);

  if (!vehicleFeature) {
    vehicleFeature = new Feature({
      geometry: new Point(coord),
      kind: 'vehicle',
      data: p,
    });
    vehicleFeature.setStyle(vehicleStyle);
    vehicleSource.addFeature(vehicleFeature);
  } else {
    const geom = vehicleFeature.getGeometry();
    if (geom) {
      geom.setCoordinates(coord);
    } else {
      vehicleFeature.setGeometry(new Point(coord));
    }
    vehicleFeature.set('data', p);
  }
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                           */
/* ------------------------------------------------------------------ */

function showTooltip(html, coordinate) {
  if (!tooltipEl.value) return;
  tooltipEl.value.innerHTML = html;
  tooltipEl.value.style.display = 'block';
  overlay.setPosition(coordinate);
}

function hideTooltip() {
  if (!tooltipEl.value) return;
  tooltipEl.value.style.display = 'none';
  overlay.setPosition(undefined);
}

function formatFeatureHtml(feature) {
  const kind = feature.get('kind');
  const data = feature.get('data');

  if (kind === 'path-point') {
    const d = new Date(data.timeStamp * 1000);
    return `
      <div style="font-family:system-ui;font-size:13px;line-height:1.5;">
        <div style="font-weight:600;margin-bottom:4px;">Vehicle position</div>
        <div><b>Time:</b> ${d.toLocaleString()}</div>
        <div><b>Speed:</b> ${data.speed} km/h</div>
        <div><b>Heading:</b> ${data.heading}°</div>
      </div>
    `;
  }

  if (kind === 'store' || kind === 'closest-store') {
    const isClosest = kind === 'closest-store';
    const distLine =
      isClosest && props.closestStore
        ? `<div><b>Distance to path:</b> ${props.closestStore.distanceKm.toFixed(3)} km</div>`
        : '';
    return `
      <div style="font-family:system-ui;font-size:13px;line-height:1.5;">
        <div style="font-weight:600;margin-bottom:4px;">
          ${data.name} ${isClosest ? '⭐ (closest to path)' : ''}
        </div>
        <div><b>Lat:</b> ${data.latitude.toFixed(5)}</div>
        <div><b>Lng:</b> ${data.longitude.toFixed(5)}</div>
        ${distLine}
      </div>
    `;
  }

  if (kind === 'vehicle') {
    const d = new Date(data.timeStamp * 1000);
    return `
      <div style="font-family:system-ui;font-size:13px;line-height:1.5;">
        <div style="font-weight:600;margin-bottom:4px;">🚗 Vehicle (current)</div>
        <div><b>Time:</b> ${d.toLocaleString()}</div>
        <div><b>Speed:</b> ${data.speed} km/h</div>
        <div><b>Heading:</b> ${data.heading}°</div>
      </div>
    `;
  }

  return '';
}

/* ------------------------------------------------------------------ */
/* Map lifecycle                                                     */
/* ------------------------------------------------------------------ */

function initMap() {
  pathSource = new VectorSource();
  storesSource = new VectorSource();
  vehicleSource = new VectorSource();

  const pathLayer = new VectorLayer({ source: pathSource });
  const storesLayer = new VectorLayer({ source: storesSource });
  const vehicleLayer = new VectorLayer({ source: vehicleSource });

  overlay = new Overlay({
    element: tooltipEl.value,
    positioning: 'bottom-center',
    offset: [0, -12],
    stopEvent: false,
  });

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ source: new OSM() }),
      pathLayer,
      storesLayer,
      vehicleLayer,
    ],
    overlays: [overlay],
    controls: defaultControls({ attribution: true, zoom: true, rotate: false }),
    view: new View({
      center: fromLonLat([18.65, -33.95]),
      zoom: 10,
    }),
  });

  map.on('pointermove', (evt) => {
    const feature = map.forEachFeatureAtPixel(
      evt.pixel,
      (f) => f,
      { hitTolerance: 15 }
    );

    if (feature && feature.get('kind') !== 'path') {
      showTooltip(formatFeatureHtml(feature), evt.coordinate);
      map.getTargetElement().style.cursor = 'pointer';
    } else {
      hideTooltip();
      map.getTargetElement().style.cursor = '';
    }
  });

  map.getTargetElement().addEventListener('mouseleave', () => {
    hideTooltip();
  });

  map.on('click', (evt) => {
    const feature = map.forEachFeatureAtPixel(
      evt.pixel,
      (f) => f,
      { hitTolerance: 15 }
    );
    if (!feature) return;

    const kind = feature.get('kind');
    if (
      kind === 'path-point' ||
      kind === 'store' ||
      kind === 'closest-store' ||
      kind === 'vehicle'
    ) {
      emit('feature-click', {
        kind,
        data: feature.get('data'),
      });
    }
  });

  window.addEventListener('resize', handleResize);
}

function handleResize() {
  if (map) map.updateSize();
}

/* ------------------------------------------------------------------ */
/* Data rendering                                                    */
/* ------------------------------------------------------------------ */

function renderData() {
  if (!map) return;

  pathSource.clear();

  if (colorMode.value === 'speed') {
    // Multi-colored segments + invisible hover points
    const segments = buildSpeedSegments(props.path);
    pathSource.addFeatures(segments);
    pathSource.addFeatures(buildHoverPoints(props.path));
  } else {
    // Single blue line + hover points
    pathSource.addFeatures(buildPathFeatures(props.path));
  }

  storesSource.clear();
  storesSource.addFeatures(buildStoreFeatures(props.stores, props.closestStore));

  if (props.currentIndex >= 0) updateVehicleFeature();

  if (props.path.length > 1) {
    const extent = pathSource.getExtent();
    if (extent && !isNaN(extent[0])) {
      map.getView().fit(extent, {
        padding: [40, 40, 40, 40],
        duration: 0,
        maxZoom: 14,
      });
    }
  }
}

onMounted(() => {
  initMap();
  renderData();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (map) map.setTarget(undefined);
  map = null;
});

watch(() => [props.path, props.stores, props.closestStore], renderData, {
  deep: false,
});

watch(() => props.currentIndex, updateVehicleFeature);

watch(() => props.isPlaying, (playing) => {
  if (!playing) hideTooltip();
});

watch(colorMode, () => {
  renderData();
});
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container"></div>
    <div ref="tooltipEl" class="map-tooltip"></div>

    <!-- Color mode toggle (top-left) -->
    <div class="color-toggle">
      <button
        :class="['toggle-btn', { active: colorMode === 'simple' }]"
        @click="colorMode = 'simple'"
      >Simple</button>
      <button
        :class="['toggle-btn', { active: colorMode === 'speed' }]"
        @click="colorMode = 'speed'"
      >Speed</button>
    </div>

    <!-- Legend (bottom-left) -->
    <div class="map-legend">
      <div class="legend-title">Legend</div>

      <template v-if="colorMode === 'simple'">
        <div class="legend-item">
          <span class="legend-swatch path"></span>
          <span>Vehicle path</span>
        </div>
      </template>

      <template v-else>
        <div class="legend-subtitle">Path speed</div>
        <div
          v-for="band in SPEED_BANDS"
          :key="band.label"
          class="legend-item"
        >
          <span
            class="legend-swatch"
            :style="{ backgroundColor: band.color }"
          ></span>
          <span>{{ band.label }}</span>
        </div>
      </template>

      <div class="legend-item">
        <span class="legend-swatch store"></span>
        <span>Store</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch closest"></span>
        <span>Closest store ⭐</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch vehicle"></span>
        <span>Vehicle (current)</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.map-container {
  width: 100%;
  height: 100%;
  background: #e5e7eb;
}

.map-tooltip {
  display: none;
  position: absolute;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 1000;
  max-width: 240px;
}

/* ---------------- Color mode toggle ---------------- */

.color-toggle {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 3px;
  display: flex;
  gap: 2px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  z-index: 5;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.toggle-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
}

.toggle-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.toggle-btn.active {
  background: #3b82f6;
  color: #ffffff;
}

/* ---------------- Legend ---------------- */

.map-legend {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  color: #374151;
  z-index: 5;
  pointer-events: none;
  min-width: 140px;
}

.legend-title {
  font-weight: 700;
  font-size: 11px;
  color: #111827;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.legend-subtitle {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 6px 0 4px 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  line-height: 1.2;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #d1d5db;
}

.legend-swatch.path {
  width: 16px;
  height: 4px;
  border-radius: 2px;
  background: #3b82f6;
  border: none;
  box-shadow: none;
}

.legend-swatch.store {
  background: #10b981;
}

.legend-swatch.closest {
  background: #ef4444;
  width: 16px;
  height: 16px;
}

.legend-swatch.vehicle {
  background: #8b5cf6;
  width: 16px;
  height: 16px;
}
</style>