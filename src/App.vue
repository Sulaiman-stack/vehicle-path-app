<!-- src/App.vue -->
<!--
  Root component of the vehicle-path app.
  Responsibilities:
    - Load PathTravelled.json and stores.csv from /public
    - Compute trip statistics (distance, max speed, closest store, first proximity)
    - Manage playback state (current index, playing flag, speed)
    - Render the OpenLayers map and the stats panel side-by-side
-->
<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import Papa from 'papaparse';
import MapView from './components/MapView.vue';
import StatsPanel from './components/StatsPanel.vue';
import {
  totalDistanceKm,
  maxSpeed,
  findClosestStore,
  firstProximityTimestamp,
} from './utils/geo.js';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

// Proximity threshold: how close the vehicle must get to the store
// to be considered "arrived near it". 5 km works well for this dataset.
const PROXIMITY_THRESHOLD_KM = 5.0;

// Playback timer interval (ms). 50ms = 20 updates/sec for smooth motion.
const PLAYBACK_TICK_MS = 50;

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

const path = ref([]);
const stores = ref([]);
const loading = ref(true);
const error = ref(null);

/* ---------------- Playback state ---------------- */

const currentIndex = ref(-1);      // which path point the vehicle is at (-1 = idle)
const isPlaying = ref(false);
const playbackSpeed = ref(5);      // multiplier (5x default — gentle pace)
let playbackTimer = null;

/* ------------------------------------------------------------------ */
/* Data loading                                                       */
/* ------------------------------------------------------------------ */

async function loadPath() {
  const res = await fetch('/pathtravelled.json');
  if (!res.ok) throw new Error(`Failed to load path: ${res.status}`);
  return res.json();
}

async function loadStores() {
  const res = await fetch('/stores.csv');
  if (!res.ok) throw new Error(`Failed to load stores: ${res.status}`);

  const text = await res.text();

  // NOTE: the file uses ';' as the delimiter (not ',').
  const parsed = Papa.parse(text, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length) {
    console.warn('CSV parse warnings:', parsed.errors);
  }

  return parsed.data
    .map((row) => ({
      name: (row.Store || '').trim(),
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
    }))
    .filter((s) => s.name && !isNaN(s.latitude) && !isNaN(s.longitude));
}

onMounted(async () => {
  try {
    const [p, s] = await Promise.all([loadPath(), loadStores()]);
    path.value = p;
    stores.value = s;
  } catch (e) {
    console.error(e);
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (playbackTimer) clearInterval(playbackTimer);
});

/* ------------------------------------------------------------------ */
/* Derived statistics                                                 */
/* ------------------------------------------------------------------ */

const totalKm = computed(() => totalDistanceKm(path.value));

const topSpeed = computed(() => maxSpeed(path.value));

const closestStore = computed(() =>
  findClosestStore(stores.value, path.value)
);

const proximityTs = computed(() => {
  if (!closestStore.value) return null;
  return firstProximityTimestamp(
    path.value,
    closestStore.value.store,
    PROXIMITY_THRESHOLD_KM
  );
});

/* ------------------------------------------------------------------ */
/* Playback controls (tuned for smooth slow-motion)                   */
/* ------------------------------------------------------------------ */

function startPlayback() {
  if (!path.value.length) return;

  if (currentIndex.value >= path.value.length - 1) {
    currentIndex.value = 0;
  }
  if (currentIndex.value < 0) {
    currentIndex.value = 0;
  }

  isPlaying.value = true;

  if (playbackTimer) clearInterval(playbackTimer);

  // Step size scales with speed. At 1x, step is 1 (slowest possible).
  // At 300x, step is 30 (fast blur).
  playbackTimer = setInterval(() => {
    const step = Math.max(1, Math.round(playbackSpeed.value / 10));
    currentIndex.value = Math.min(
      currentIndex.value + step,
      path.value.length - 1
    );

    if (currentIndex.value >= path.value.length - 1) {
      stopPlayback();
    }
  }, PLAYBACK_TICK_MS);
}

function stopPlayback() {
  isPlaying.value = false;
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
}

function resetPlayback() {
  stopPlayback();
  currentIndex.value = 0;
}

function togglePlayback() {
  isPlaying.value ? stopPlayback() : startPlayback();
}

/* ------------------------------------------------------------------ */
/* Feature click feedback (bonus)                                     */
/* ------------------------------------------------------------------ */

const lastClick = ref(null);

function onFeatureClick(payload) {
  lastClick.value = payload;
  console.log('Clicked feature:', payload);
}
</script>

<template>
  <div class="app-layout">
    <!-- Loading state -->
    <div v-if="loading" class="loading-screen">
      <div class="spinner"></div>
      <p>Loading trip data…</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error-screen">
      <h2>⚠️ Something went wrong</h2>
      <p>{{ error }}</p>
      <p class="hint">
        Make sure <code>pathtravelled.json</code> and <code>stores.csv</code>
        are inside the <code>public/</code> folder.
      </p>
    </div>

    <!-- Main UI -->
    <template v-else>
      <StatsPanel
        :total-distance-km="totalKm"
        :max-speed="topSpeed"
        :first-proximity-ts="proximityTs"
        :closest-store="closestStore"
        :path="path"
        :current-index="currentIndex"
        :is-playing="isPlaying"
        :playback-speed="playbackSpeed"
        @toggle-playback="togglePlayback"
        @reset-playback="resetPlayback"
        @update:playback-speed="playbackSpeed = $event"
      />

      <main class="map-area">
        <MapView
          :path="path"
          :stores="stores"
          :closest-store="closestStore"
          :current-index="currentIndex"
          :is-playing="isPlaying"
          @feature-click="onFeatureClick"
        />
      </main>
    </template>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.map-area {
  flex: 1;
  min-width: 0;
  position: relative;
}

/* ---------------- Loading & error screens ---------------- */

.loading-screen,
.error-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  gap: 12px;
  color: #374151;
  background: #f9fafb;
  padding: 24px;
  text-align: center;
}

.error-screen h2 {
  margin: 0;
  color: #ef4444;
}

.error-screen code {
  background: #e5e7eb;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.error-screen .hint {
  color: #6b7280;
  font-size: 13px;
  max-width: 420px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------------- Responsive layout ---------------- */

@media (max-width: 768px) {
  .app-layout {
    flex-direction: column-reverse;
  }

  .map-area {
    flex: 1;
    min-height: 300px;
  }
}
</style>