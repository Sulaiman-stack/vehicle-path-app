# Vehicle Path Analyzer

A Vue 3 + OpenLayers application that visualizes a vehicle's GPS journey, identifies the store closest to its path, and lets you explore the trip interactively.

---

## Task Overview

Given a JSON file of GPS points (`PathTravelled.json`) and a CSV of store locations (`storesCopy.csv`), the app:

1. Renders the vehicle's path on an interactive map
2. Plots all store locations
3. Highlights the store closest to the path
4. Displays key statistics: total distance, highest speed, and time of first proximity to the closest store

---

## Features

### Map & path
- Interactive map powered by OpenLayers + OpenStreetMap
- Vehicle path drawn as a polyline
- Store markers (green) with the closest store highlighted (red star)
- Hover tooltips on path points, stores, and the vehicle marker

### Trip statistics
- Total distance (haversine sum, skipping stationary duplicate points)
- Highest speed during the trip
- Trip duration
- Time of first proximity to the closest store (within 5 km)
- Path point count

### Closest stores
- Top 5 closest stores ranked by distance to the path
- Full closest store details: name, coordinates, distance to path, first proximity time

### Search & selection
- Search box to filter stores by name (case-insensitive)
- Click a result to pan the map to that store + amber highlight ring
- Focused Store card in the sidebar with full details

### Playback
- Animated vehicle marker along the path
- Play/Pause/Reset controls
- Speed multiplier: 1x, 2x, 5x, 10x, 30x, 60x, 120x, 300x
- Progress bar showing % complete
- Live "current position" card (time, speed, heading) during playback

### Path visualization modes
- Simple: single blue polyline
- Speed: path split into segments colored by speed (blue, green, yellow, orange, red)

### Basemaps
- Streets (OpenStreetMap)
- Satellite (Esri World Imagery)
- Terrain (OpenTopoMap)
- All free, no API keys

### Responsive
- Desktop: sidebar + map side by side
- Mobile (below 768px): sidebar stacks as bottom sheet, map on top

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Vue 3 (Composition API, script setup) | Reactive state, component-based, small bundle |
| Build tool | Vite | Fast dev server, HMR, modern tooling |
| Map library | OpenLayers | Fully free, no API key, open-source (BSD) |
| Map tiles | OpenStreetMap / Esri / OpenTopoMap | Free, no signup |
| Geospatial math | Turf.js | Battle-tested GIS algorithms |
| CSV parsing | PapaParse | Handles custom delimiters (the CSV uses semicolons) |

---

## Approach

### 1. Data loading
- pathtravelled.json is fetched from /public and used directly as an array of GPS samples.
- stores.csv is fetched as text and parsed with PapaParse using a semicolon delimiter.
- Rows with missing names or invalid coordinates are filtered out.

### 2. Distance & speed
- Total distance = sum of haversine distances between consecutive points.
- Stationary duplicates (same lat/lng) are skipped to avoid inflating the total.
- Max speed = Math.max over all path points.

### 3. Closest store to path
- Uses Turf's pointToLineDistance to measure each store's distance to the polyline.
- The store with the smallest distance wins.
- More accurate than checking the nearest GPS sample, because the vehicle may pass closest to a store between two recorded points.

### 4. First proximity timestamp
- Walks the path chronologically and returns the timestamp of the first sample within 5 km of the closest store.

### 5. UI/UX
- Layout: Flexbox side panel + map.
- Responsive: Below 768px, the layout flips to a bottom-sheet.
- Interactivity:
  - Hover the blue path shows a tooltip with time/speed/heading.
  - Hover any store shows a tooltip with name + coordinates.
  - Click a store pans the map and shows an amber highlight + sidebar card.
  - Playback controls follow the vehicle and show live position.

---

## Project Structure
