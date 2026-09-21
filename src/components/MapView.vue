<!-- src/components/MapView.vue -->
<!--
  Renders an OpenLayers map showing:
    - The vehicle's GPS path (as a polyline)
    - All store locations (as markers)
    - The closest store highlighted differently
    - An animated vehicle marker at the current playback index
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

const props = defineProps({
  // Array of { latitude, longitude, timeStamp, heading, speed }
  path: { type: Array, default: () => [] },
  // Array of { name, latitude, longitude }
  stores: { type: Array, default: () => [] },
  // The closest store object: { store, distanceKm } or null
  closestStore: { type: Object, default: null },
  // Index of the path point the vehicle is currently at (for animation)
  // -1 means "not playing / no active position"
  currentIndex: { type: Number, default: -1 },
  // Whether playback is active (used for hover behavior if needed)
  isPlaying: { type: Boolean, default: false },
});

const emit = defineEmits(['feature-click']);

const mapContainer = ref(null);          // DOM element for the map
const tooltipEl = ref(null);             // DOM element for the tooltip
let map = null;
let overlay = null;
let pathSource = null;
let storesSource = null;
let vehicleSource = null;     // holds the moving vehicle marker
let vehicleFeature = null;    // the marker feature itself

/* ------------------------------------------------------------------ */
/* Styles for map features                                            */
/* ------------------------------------------------------------------ */

// Path line style — blue
const pathStyle = new Style({
  stroke: new Stroke({ color: '#3b82f6', width: 4 }),
});

// Regular store marker — small green dot with white border
const storeStyle = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: '#10b981' }),
    stroke: new Stroke({ color: '#ffffff', width: 2 }),
  }),
});

// Closest store marker — larger red dot so it stands out
const closestStoreStyle = new Style({
  image: new CircleStyle({
    radius: 11,
    fill: new Fill({ color: '#ef4444' }),
    stroke: new Stroke({ color: '#ffffff', width: 3 }),
  }),
});

// Vehicle marker — purple circle with a white ring, always on top
const vehicleStyle = new Style({
  image: new CircleStyle({
    radius: 9,
    fill: new Fill({ color: '#8b5cf6' }),
    stroke: new Stroke({ color: '#ffffff', width: 3 }),
  }),
  zIndex: 10,
});

/* ------------------------------------------------------------------ */
/* Build features from data                                           */
/* ------------------------------------------------------------------ */

function buildPathFeatures(path) {
  if (!path?.length) return [];

  const coords = path.map((p) => fromLonLat([p.longitude, p.latitude]));
  const lineFeature = new Feature({
    geometry: new LineString(coords),
    kind: 'path',
  });
  lineFeature.setStyle(pathStyle);

  // Hidden point per path sample so hovering near the line still
  // gives us access to that point's timestamp/speed/heading.
  const pointFeatures = path.map((p, idx) => {
    const f = new Feature({
      geometry: new Point(fromLonLat([p.longitude, p.latitude])),
      kind: 'path-point',
      data: p,
      index: idx,
    });
    f.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: 'transparent' }),
        }),
      })
    );
    return f;
  });

  return [lineFeature, ...pointFeatures];
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

/**
 * Update or create the vehicle marker at the current playback index.
 * Optimized: mutates existing geometry instead of recreating it.
 */
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
/* Tooltip helpers                                                    */
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

/**
 * Format the popup HTML for a given clicked/hovered feature.
 */
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
/* Map lifecycle                                                      */
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

  // Pointer move: always active — works during playback AND when paused.
  // Increased hitTolerance so hovering the thin path is easier.
  map.on('pointermove', (evt) => {
    const feature = map.forEachFeatureAtPixel(
      evt.pixel,
      (f) => f,
      { hitTolerance: 10 }
    );

    if (feature && feature.get('kind') !== 'path') {
      showTooltip(formatFeatureHtml(feature), evt.coordinate);
      map.getTargetElement().style.cursor = 'pointer';
    } else {
      hideTooltip();
      map.getTargetElement().style.cursor = '';
    }
  });

  // Clear tooltip when mouse leaves the map entirely
  map.getTargetElement().addEventListener('mouseleave', () => {
    hideTooltip();
  });

  // Click: emit for parent if user clicks a path point, store, or vehicle
  map.on('click', (evt) => {
    const feature = map.forEachFeatureAtPixel(
      evt.pixel,
      (f) => f,
      { hitTolerance: 10 }
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
/* React to data changes                                              */
/* ------------------------------------------------------------------ */

function renderData() {
  if (!map) return;

  pathSource.clear();
  const pathFeatures = buildPathFeatures(props.path);
  pathSource.addFeatures(pathFeatures);

  storesSource.clear();
  const storeFeatures = buildStoreFeatures(props.stores, props.closestStore);
  storesSource.addFeatures(storeFeatures);

  if (props.currentIndex >= 0) {
    updateVehicleFeature();
  }

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

// Re-render whenever data changes
watch(() => [props.path, props.stores, props.closestStore], renderData, {
  deep: false,
});

// Move the vehicle marker when the playback index changes
watch(() => props.currentIndex, updateVehicleFeature);

// When playback stops, clear the tooltip so hover is instantly responsive
watch(() => props.isPlaying, (playing) => {
  if (!playing) hideTooltip();
});
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-container"></div>
    <div ref="tooltipEl" class="map-tooltip"></div>
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
</style>