# Vehicle Path Analyzer

A Vue 3 + OpenLayers application that visualizes a vehicle's GPS journey and identifies the store closest to its path.

## 🎯 Task Overview

Given a JSON file of GPS points (`PathTravelled.json`) and a CSV of store locations (`storesCopy.csv`), the app:

1. Renders the vehicle's path on an interactive map
2. Plots all store locations
3. Highlights the store closest to the path
4. Displays key statistics: total distance, highest speed, and the time of first proximity to the closest store

## 🛠️ Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Vue 3** (Composition API, `<script setup>`) | Reactive state, component-based, small bundle |
| Build tool | **Vite** | Fast dev server, HMR, modern tooling |
| Map library | **OpenLayers** | Fully free, no API key, open-source (BSD) |
| Map tiles | **OpenStreetMap** | Free, no signup, community-maintained |
| Geospatial math | **Turf.js** | Battle-tested GIS algorithms (haversine distance, point-to-line) |
| CSV parsing | **PapaParse** | Handles custom delimiters (the CSV uses `;` not `,`) |

## 📐 Approach

### 1. Data loading
- `pathtravelled.json` is fetched from `/public` and used directly as an array of GPS samples (`{ latitude, longitude, timeStamp, heading, speed }`).
- `stores.csv` is fetched as text and parsed with PapaParse using a `;` delimiter (the file's actual separator).
- Rows with missing names or invalid coordinates are filtered out.

### 2. Distance calculation
Total distance is the sum of haversine distances between consecutive GPS points. Stationary duplicate points (same lat/lng) are skipped to avoid inflating the total during parking periods.

### 3. Closest store to path
For each store, we compute the shortest distance from that point to the polyline representing the vehicle's path — using Turf's `pointToLineDistance`. The store with the smallest such distance is "closest to the path."

This is more accurate than just checking the nearest GPS sample: the vehicle may pass closest to the store *between* two recorded samples.

### 4. First proximity timestamp
Walking the path chronologically, we find the first GPS sample within a threshold (5 km) of the closest store and return its timestamp.

### 5. UI / UX
- **Layout:** Side panel + map, flexbox-based.
- **Responsive:** On screens < 768px the layout flips to a bottom-sheet style with the map on top.
- **Interactivity:**
  - Hover the blue path line → tooltip with time / speed / heading.
  - Hover any store marker → tooltip with name and coordinates.
  - Closest store is styled distinctly (larger red dot) vs. other stores (small green dots).

## 📂 Project Structure
