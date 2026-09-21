<!-- src/components/StatsPanel.vue -->
<!--
  Side panel showing:
    1. Trip statistics: distance, max speed, duration, path point count
    2. Closest store info: name, distance to path, first proximity time
    3. Playback controls: Play/Pause, Reset, speed multiplier
    4. Live "current position" info during playback
-->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  totalDistanceKm: { type: Number, default: 0 },
  maxSpeed: { type: Number, default: 0 },
  firstProximityTs: { type: Number, default: null },
  closestStore: { type: Object, default: null },
  path: { type: Array, default: () => [] },
  // Playback state (from App.vue)
  currentIndex: { type: Number, default: -1 },
  isPlaying: { type: Boolean, default: false },
  playbackSpeed: { type: Number, default: 60 },
});

const emit = defineEmits([
  'toggle-playback',
  'reset-playback',
  'update:playback-speed',
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

/* Number of path points, for context. */
const pointCount = computed(() => props.path?.length ?? 0);

/* Current playback point (or null if not playing yet). */
const currentPoint = computed(() => {
  const i = props.currentIndex;
  if (i < 0 || i >= props.path.length) return null;
  return props.path[i];
});

/* Speed multiplier options shown as buttons. */
const speedOptions = [1, 2, 5, 10, 30, 60, 120, 300];
</script>

<template>
  <aside class="stats-panel">
    <header class="stats-header">
      <h1>Trip Summary</h1>
      <p class="subtitle">Vehicle path analysis</p>
    </header>

    <!-- Key stats -->
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

    <!-- Playback controls -->
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

      <!-- Live current position during playback -->
      <div v-if="currentPoint" class="current-info">
        <div class="current-title">🚗 Current position</div>
        <div><b>Time:</b> {{ formatTs(currentPoint.timeStamp) }}</div>
        <div><b>Speed:</b> {{ currentPoint.speed }} km/h</div>
        <div><b>Heading:</b> {{ currentPoint.heading }}°</div>
      </div>
    </section>

    <!-- Closest store section -->
    <section class="closest-store" v-if="closestStore">
      <h2>Closest Store to Path</h2>
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

/* ---------------- Stat cards ---------------- */

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

/* ---------------- Playback controls ---------------- */

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
  margin-bottom: 12px;
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

/* ---------------- Closest store ---------------- */

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

/* ---------------- Mobile responsive ---------------- */

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