import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type LineLayerSpecification,
  type MapOptions,
} from "maplibre-gl";

export type OpsCoordinate = [number, number];

export type OpsLine = {
  id: string;
  coordinates: OpsCoordinate[];
};

export type OpsMarkerTone = "healthy" | "degraded" | "critical" | "neutral";

type LineFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: string };
    geometry: { type: "LineString"; coordinates: OpsCoordinate[] };
  }>;
};

/** Liberty basemap without CSS desaturation — readable terrain + roads for ops work. */
export const OPS_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/** Angeles Forest / Antelope Valley survey area (demo default). */
export const OPS_MAP_CENTER: OpsCoordinate = [-118.24, 34.145];
export const OPS_MAP_DEFAULT_ZOOM = 11.5;

export const OPS_TRAIL_PAINT: NonNullable<LineLayerSpecification["paint"]> = {
  "line-color": "#0b1220",
  "line-width": 3.25,
  "line-opacity": 0.92,
  "line-blur": 0.15,
};

export const OPS_ROUTE_PAINT: NonNullable<LineLayerSpecification["paint"]> = {
  "line-color": "#1f5f8b",
  "line-width": 2.5,
  "line-opacity": 0.85,
  "line-dasharray": [1.6, 1.4],
};

export const OPS_REPLAY_TRAIL_PAINT: NonNullable<LineLayerSpecification["paint"]> = {
  "line-color": "#16324a",
  "line-width": 2.75,
  "line-opacity": 0.88,
};

export function createOpsMap(
  container: HTMLElement,
  options: Partial<Omit<MapOptions, "container">> = {},
): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: OPS_MAP_STYLE,
    center: OPS_MAP_CENTER,
    zoom: OPS_MAP_DEFAULT_ZOOM,
    attributionControl: { compact: true },
    ...options,
  });
  map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
  map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-right");
  return map;
}

export function updateLineGeoJson(
  map: MapLibreMap,
  {
    sourceId,
    layerId = `${sourceId}-line`,
    lines,
    paint,
  }: {
    sourceId: string;
    layerId?: string;
    lines: OpsLine[];
    paint: NonNullable<LineLayerSpecification["paint"]>;
  },
): boolean {
  if (!map.isStyleLoaded()) return false;

  const data: LineFeatureCollection = {
    type: "FeatureCollection",
    features: lines
      .filter((line) => line.coordinates.length > 1)
      .map((line) => ({
        type: "Feature",
        properties: { id: line.id },
        geometry: { type: "LineString", coordinates: line.coordinates },
      })),
  };
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    const layer = map.getLayer(layerId);
    if (layer) {
      for (const [key, value] of Object.entries(paint)) {
        map.setPaintProperty(layerId, key as keyof typeof paint, value);
      }
    }
    return true;
  }

  map.addSource(sourceId, { type: "geojson", data });
  // Light casing so dark trails stay readable over both parks and dense streets.
  map.addLayer({
    id: `${layerId}-casing`,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": "#ffffff",
      "line-width": (typeof paint["line-width"] === "number" ? paint["line-width"] : 2) + 3,
      "line-opacity": 0.7,
      "line-blur": 0.35,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    paint,
    layout: { "line-cap": "round", "line-join": "round" },
  });
  return true;
}

export function updateWhenStyleReady(map: MapLibreMap, update: () => void): () => void {
  if (map.isStyleLoaded()) {
    update();
    return () => undefined;
  }
  map.once("load", update);
  return () => map.off("load", update);
}

export function fitCoordinates(
  map: MapLibreMap,
  coordinates: OpsCoordinate[],
  { padding = 72, maxZoom = 13, duration = 0 }: { padding?: number; maxZoom?: number; duration?: number } = {},
): void {
  const valid = coordinates.filter(
    ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180,
  );
  if (valid.length === 0) return;
  if (valid.length === 1) {
    map.easeTo({ center: valid[0], zoom: Math.min(maxZoom, 12.5), duration });
    return;
  }
  const bounds = new LngLatBounds();
  for (const coordinate of valid) bounds.extend(coordinate);
  map.fitBounds(bounds, { padding, maxZoom, duration });
}

export function createVehicleMarkerElement({
  callsign,
  tone = "neutral",
  selected = false,
  showLabel = false,
}: {
  callsign: string;
  tone?: OpsMarkerTone;
  selected?: boolean;
  showLabel?: boolean;
}): HTMLDivElement {
  const root = document.createElement("div");
  root.className = `sentinel-vehicle-marker tone-${tone}${selected ? " selected" : ""}`;
  root.innerHTML = `
    <span class="sentinel-vehicle-halo" aria-hidden="true"></span>
    <span class="sentinel-vehicle-chevron" aria-hidden="true"></span>
    <span class="sentinel-vehicle-label">${escapeHtml(callsign)}</span>
  `;
  if (showLabel || selected) root.classList.add("show-label");
  return root;
}

export function createWaypointMarkerElement({
  label,
  selected = false,
}: {
  label: string;
  selected?: boolean;
}): HTMLDivElement {
  const root = document.createElement("div");
  root.className = `sentinel-waypoint-marker${selected ? " selected" : ""}`;
  root.innerHTML = `
    <span class="sentinel-waypoint-dot" aria-hidden="true"></span>
    <span class="sentinel-waypoint-label">${escapeHtml(label)}</span>
  `;
  return root;
}

export function upsertVehicleMarker({
  map,
  markers,
  vehicleId,
  longitude,
  latitude,
  callsign,
  headingDeg,
  tone = "neutral",
  selected,
  onSelect,
}: {
  map: MapLibreMap;
  markers: Record<string, Marker>;
  vehicleId: string;
  longitude: number;
  latitude: number;
  callsign: string;
  headingDeg: number;
  tone?: OpsMarkerTone;
  selected: boolean;
  onSelect: () => void;
}): Marker {
  let marker = markers[vehicleId];
  if (!marker) {
    marker = new Marker({
      element: createVehicleMarkerElement({ callsign, tone, selected, showLabel: selected }),
      anchor: "center",
    })
      .setLngLat([longitude, latitude])
      .addTo(map);
    markers[vehicleId] = marker;
  } else {
    marker.setLngLat([longitude, latitude]);
  }

  const element = marker.getElement();
  element.className = `sentinel-vehicle-marker tone-${tone}${selected ? " selected show-label" : ""}`;
  const label = element.querySelector(".sentinel-vehicle-label");
  if (label) label.textContent = callsign;
  updateMarkerHeading(marker, headingDeg);
  makeMarkerInteractive(marker, `${callsign} position`, onSelect);
  return marker;
}

export function makeMarkerInteractive(marker: Marker, label: string, onSelect: () => void): void {
  const element = marker.getElement();
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", label);
  element.tabIndex = 0;
  element.onclick = (event) => {
    event.stopPropagation();
    onSelect();
  };
  element.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
}

export function updateMarkerHeading(marker: Marker, headingDeg: number): void {
  const element = marker.getElement();
  const chevron = element.querySelector<HTMLElement>(".sentinel-vehicle-chevron");
  if (chevron) {
    chevron.style.transform = `rotate(${Number.isFinite(headingDeg) ? headingDeg : 0}deg)`;
    return;
  }
  // Legacy fallback for markers that still use the default MapLibre pin chrome.
  let heading = element.querySelector<HTMLElement>(".sentinel-marker-heading");
  if (!heading) {
    heading = document.createElement("span");
    heading.className = "sentinel-marker-heading";
    heading.textContent = "▲";
    heading.setAttribute("aria-hidden", "true");
    element.appendChild(heading);
  }
  heading.style.transform = `rotate(${Number.isFinite(headingDeg) ? headingDeg : 0}deg)`;
}

export function setMarkerSelected(marker: Marker, selected: boolean): void {
  const element = marker.getElement();
  element.classList.toggle("selected", selected);
  element.classList.toggle("show-label", selected);
  if (!element.classList.contains("sentinel-vehicle-marker")) {
    element.style.opacity = selected ? "1" : "0.55";
  }
}

export function communicationsTone(state: string | undefined | null): OpsMarkerTone {
  const value = (state ?? "").toUpperCase();
  if (["DISCONNECTED", "CRITICAL", "LOST"].some((token) => value.includes(token))) return "critical";
  if (["DEGRADED", "STALE", "RECOVERING", "WARNING"].some((token) => value.includes(token))) return "degraded";
  if (["HEALTHY", "AVAILABLE", "CONNECTED", "LIVE"].some((token) => value.includes(token))) return "healthy";
  return "neutral";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
