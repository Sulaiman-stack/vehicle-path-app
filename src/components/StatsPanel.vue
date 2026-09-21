<!-- src/components/StatsPanel.vue -->
<!--
  Side panel showing:
    1. Store search box + filtered results
    2. Focused store card (when a store is selected)
    3. Trip statistics: distance, max speed, duration, path point count
    4. Playback controls: Play/Pause, Reset, speed multiplier, progress bar
    5. Live "current position" info during playback
    6. Top 5 closest stores ranked list
    7. Detailed info for the single closest store
-->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  totalDistanceKm: { type: Number, default: 0 },
  maxSpeed: { type: Number, default: 0 },
  firstProximityTs: { type: Number, default: null },
  closestStore: { type: Object, default: null },
  topClosestStores: { type: Array, default: () => [] },
  path: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: -1 },
  isPlaying: { type: Boolean, default: false },
  playbackSpeed: { type: Number, default: 5 },
  searchQuery: { type: String, default: '' },
  filteredStores: { type: Array, default: () => [] },
  selectedStore: { type: Object, default: null },
});

const emit = defineEmits([
  'toggle-playback',
  'reset-playback',
  'update:playback-speed',
  'update:search-query',
  'select-store',
  'clear-selection',
]);

/* Format a Unix-seconds timestamp into a friendly local string. */
function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

/* Trip duration = last timestamp - first timestamp. */
const tripDuration = computed(() => {
  if (!props.path?.length) return '—';
  const first = props.path[0].timeStamp;
  const last = props.path[props.path.length - 1].timeStamp;
  const seconds = last - first;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
});

const pointCount = computed(() => props.path?.length ?? 0);

const currentPoint = computed(() => {
  const i = props.currentIndex;
  if (i < 0 || i >= props.path.length) return null;
  return props.path[i];
});

const progressPct = computed(() => {
  if (!props.path.length) return 0;
  if (props.currentIndex < 0) return 0;
  return Math.round(((props.currentIndex + 1) / props.path.length) * 100);
});

const speedOptions = [1, 2, 5, 10, 30, 60, 120, 300];

const hasQuery = computed(() => props.searchQuery.trim().length > 0);

/* Distance of the currently-selected store to the path (if it's the closest). */
const selectedDistanceKm = computed(() => {
  if (!props.selectedStore || !props.closestStore) return null;
  if (props.selectedStore.name === props.closestStore.store.name) {
    return props.closestStore.distanceKm;
  }
  return null;
});

function onSearchInput(e) {
  emit('update:search-query', e.target.value);
}

function clearSearch() {
  emit('update:search-query', '');
}
</script>

<template>
  <aside class="stats-panel">
    <header class="stats-header">
      <h1>Trip Summary</h1>
      <p class="subtitle">Vehicle path analysis</p>
    </header>

    <!-- ============= Store search ============= -->
    <section class="search-section">
      <h2>Find a Store</h2>

      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          class="search-input"
          placeholder="Search store name…"
          :value="searchQuery"
          @input="onSearchInput"
        />
        <button
          v-if="hasQuery"
          class="search-clear"
          @click="clearSearch"
          aria-label="Clear search"
        >
          ×
        </button>
      </div>

      <div v-if="hasQuery" class="search-results">
        <div v-if="filteredStores.length === 0" class="search-empty">
          No stores match "{{ searchQuery }}"
        </div>
        <button
          v-for="store in filteredStores"
          :key="store.name + store.latitude"
          class="search-result"
          :class="{ active: selectedStore && selectedStore.name === store.name }"
          @click="emit('select-store', store)"
        >
          <span class="result-name">{{ store.name }}</span>
          <span class="result-coords">
            {{ store.latitude.toFixed(3) }}, {{ store.longitude.toFixed(3) }}
          </span>
        </button>
      </div>

      <div v-if="selectedStore" class="selected-chip">
        <span>📍 {{ selectedStore.name }}</span>
        <button
          class="chip-close"
          @click="emit('clear-selection')"
          aria-label="Clear selection"
        >
          ×
        </button>
      </div>
    </section>

    <!-- ============= Focused store card ============= -->
    <section v-if="selectedStore" class="focused-store">
      <h2>Focused Store</h2>
      <div class="focused-name">{{ selectedStore.name }}</div>

      <dl class="focused-details">
        <div>
          <dt>Latitude</dt>
          <dd>{{ selectedStore.latitude.toFixed(5) }}</dd>
        </div>
        <div>
          <dt>Longitude</dt>
          <dd>{{ selectedStore.longitude.toFixed(5) }}</dd>
        </div>
        <div v-if="selectedDistanceKm !== null">
          <dt>Distance to path</dt>
          <dd>{{ selectedDistanceKm.toFixed(3) }} km</dd>
        </div>
      </dl>

      <button class="btn clear-btn" @click="emit('clear-selection')">
        ✕ Clear focus
      </button>
    </section>

    <!-- ============= Key stats ============= -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon">📏</div>
        <div class="stat-body">
          <div class="stat-label">Total distance</div>
          <div class="stat-value">
            {{ totalDistanceKm.toFixed(2) }} <span class="unit">km</span>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-body">
          <div class="stat-label">Highest speed</div>
          <div class="stat-value">{{ maxSpeed }} <span class="unit">km/h</span></div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">⏱️</div>
        <div class="stat-body">
          <div class="stat-label">Trip duration</div>
          <div class="stat-value">{{ tripDuration }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📍</div>
        <div class="stat-body">
          <div class="stat-label">Path points</div>
          <div class="stat-value">{{ pointCount }}</div>
        </div>
      </div>
    </div>

    <!-- ============= Playback ============= -->
    <section class="playback">
      <h2>Playback</h2>

      <div class="playback-buttons">
        <button class="btn primary" @click="emit('toggle-playback')">
          {{ isPlaying ? '⏸ Pause' : '▶ Play' }}
        </button>
        <button class="btn" @click="emit('reset-playback')">⏮ Reset</button>
      </div>

      <div class="speed-row">
        <span class="speed-label">Speed:</span>
        <button
          v-for="opt in speedOptions"
          :key="opt"
          class="speed-btn"
          :class="{ active: playbackSpeed === opt }"
          @click="emit('update:playback-speed', opt)"
        >
          {{ opt }}x
        </button>
      </div>

      <div class="progress-wrap">
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{ width: progressPct + '%' }"
          ></div>
        </div>
        <div class="progress-label">{{ progressPct }}%</div>
      </div>

      <div v-if="currentPoint" class="current-info">
        <div class="current-title">🚗 Current position</div>
        <div><b>Time:</b> {{ formatTs(currentPoint.timeStamp) }}</div>
        <div><b>Speed:</b> {{ currentPoint.speed }} km/h</div>
        <div><b>Heading:</b> {{ currentPoint.heading }}°</div>
      </div>
    </section>

    <!-- ============= Top 5 closest stores ============= -->
    <section class="top-stores" v-if="topClosestStores.length">
      <h2>Top {{ topClosestStores.length }} Closest Stores</h2>
      <ol class="top-stores-list">
        <li
          v-for="(item, idx) in topClosestStores"
          :key="item.store.name + idx"
          class="top-store-item"
          :class="{ primary: idx === 0 }"
          @click="emit('select-store', item.store)"
        >
          <div class="rank-badge">{{ idx + 1 }}</div>
          <div class="top-store-info">
            <div class="top-store-name">
              {{ item.store.name }}
              <span v-if="idx === 0" class="star">⭐</span>
            </div>
            <div class="top-store-distance">
              {{ item.distanceKm.toFixed(3) }} km from path
            </div>
          </div>
        </li>
      </ol>
    </section>

    <!-- ============= Closest store detail ============= -->
    <section class="closest-store" v-if="closestStore">
      <h2>Closest Store — Details</h2>
      <div class="store-name">⭐ {{ closestStore.store.name }}</div>

      <dl class="store-details">
        <div>
          <dt>Distance to path</dt>
          <dd>{{ closestStore.distanceKm.toFixed(3) }} km</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>
            {{ closestStore.store.latitude.toFixed(5) }},
            {{ closestStore.store.longitude.toFixed(5) }}
          </dd>
        </div>
        <div>
          <dt>First proximity</dt>
          <dd>{{ formatTs(firstProximityTs) }}</dd>
        </div>
      </dl>

      <p class="hint">
        First proximity = first time the vehicle came within 5&nbsp;km of this store.
      </p>
    </section>

    <section class="closest-store" v-else>
      <h2>Closest Store</h2>
      <p class="hint">Loading data…</p>
    </section>
  </aside>
</template>

<style scoped>
.stats-panel {
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  padding: 20px;
  width: 340px;
  min-width: 340px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}

.stats-header h1 {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #111827;
}

.stats-header .subtitle {
  margin: 0 0 20px 0;
  font-size: 13px;
  color: #6b7280;
}

/* =================== Search =================== */

.search-section {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.search-section h2 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-box:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-icon {
  font-size: 13px;
  color: #9ca3af;
  margin-right: 6px;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 10px 0;
  font-size: 13px;
  color: #111827;
  outline: none;
  font-family: inherit;
}

.search-input::placeholder {
  color: #9ca3af;
}

.search-clear {
  background: #e5e7eb;
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  color: #6b7280;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.search-clear:hover {
  background: #d1d5db;
  color: #111827;
}

.search-results {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.search-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s, border-color 0.1s;
}

.search-result:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.search-result.active {
  background: #dbeafe;
  border-color: #3b82f6;
}

.result-name {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-coords {
  font-size: 11px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.search-empty {
  font-size: 12px;
  color: #9ca3af;
  padding: 12px 8px;
  text-align: center;
  font-style: italic;
}

.selected-chip {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #ede9fe;
  border: 1px solid #c4b5fd;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  color: #5b21b6;
  font-weight: 500;
}

.chip-close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: #7c3aed;
  padding: 0 2px;
}

.chip-close:hover {
  color: #5b21b6;
}

/* =================== Focused store =================== */

.focused-store {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 20px;
}

.focused-store h2 {
  font-size: 12px;
  font-weight: 700;
  color: #6d28d9;
  margin: 0 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.focused-name {
  font-size: 17px;
  font-weight: 700;
  color: #5b21b6;
  margin-bottom: 10px;
}

.focused-details {
  margin: 0 0 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.focused-details > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.focused-details dt {
  color: #7c3aed;
  margin: 0;
}

.focused-details dd {
  color: #4c1d95;
  font-weight: 600;
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.clear-btn {
  width: 100%;
  background: #ffffff;
  border-color: #c4b5fd;
  color: #6d28d9;
}

.clear-btn:hover {
  background: #f3e8ff;
}

/* =================== Stat cards =================== */

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
}

.stat-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.stat-icon {
  font-size: 18px;
  line-height: 1;
}

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  word-break: break-word;
}

.stat-value .unit {
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  margin-left: 2px;
}

/* =================== Playback =================== */

.playback {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.playback h2 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.playback-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.btn {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.btn:hover {
  background: #f3f4f6;
}

.btn.primary {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
}

.btn.primary:hover {
  background: #2563eb;
}

.speed-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.speed-label {
  font-size: 12px;
  color: #6b7280;
  margin-right: 4px;
}

.speed-btn {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #374151;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
}

.speed-btn.active {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1e40af;
  font-weight: 600;
}

.progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.progress-track {
  flex: 1;
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6);
  border-radius: 999px;
  transition: width 0.15s linear;
}

.progress-label {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.current-info {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #374151;
}

.current-title {
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

/* =================== Top 5 stores =================== */

.top-stores {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.top-stores h2 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.top-stores-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.top-store-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.top-store-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.top-store-item.primary {
  background: #fef2f2;
  border-color: #fecaca;
}

.rank-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #374151;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.top-store-item.primary .rank-badge {
  background: #ef4444;
  color: #ffffff;
}

.top-store-info {
  flex: 1;
  min-width: 0;
}

.top-store-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-store-item.primary .top-store-name {
  color: #b91c1c;
}

.top-store-distance {
  font-size: 11px;
  color: #6b7280;
  margin-top: 2px;
}

.star {
  font-size: 12px;
  margin-left: 2px;
}

/* =================== Closest store detail =================== */

.closest-store h2 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.store-name {
  font-size: 18px;
  font-weight: 700;
  color: #ef4444;
  margin-bottom: 14px;
}

.store-details {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.store-details > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #f3f4f6;
}

.store-details dt {
  color: #6b7280;
  margin: 0;
}

.store-details dd {
  color: #111827;
  font-weight: 500;
  margin: 0;
  text-align: right;
}

.hint {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 12px;
  line-height: 1.4;
}

/* =================== Mobile =================== */

@media (max-width: 768px) {
  .stats-panel {
    width: 100%;
    min-width: 0;
    height: auto;
    max-height: 45vh;
    border-right: none;
    border-top: 1px solid #e5e7eb;
  }
}
</style>