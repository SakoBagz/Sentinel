import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type LineLayerSpecification,
  type MapLayerMouseEvent,
  type MapOptions,
  type ExpressionSpecification,
} from "maplibre-gl";

export type OpsCoordinate = [number, number];

export type OpsLine = {
  id: string;
  coordinates: OpsCoordinate[];
};

export type OpsMarkerTone = "healthy" | "degraded" | "critical" | "neutral";

export type VehicleMapPoint = {
  vehicleId: string;
  longitude: number;
  latitude: number;
  headingDeg: number;
  callsign: string;
  tone: OpsMarkerTone;
  selected: boolean;
};

export const VEHICLE_SOURCE_ID = "sentinel-vehicles";
const VEHICLE_HALO_CASING_LAYER = "sentinel-vehicles-halo-casing";
const VEHICLE_HALO_LAYER = "sentinel-vehicles-halo";
const VEHICLE_CHEVRON_LAYER = "sentinel-vehicles-chevron";
const VEHICLE_LABEL_LAYER = "sentinel-vehicles-label";
const VEHICLE_LAYER_STACK = [
  VEHICLE_HALO_CASING_LAYER,
  VEHICLE_HALO_LAYER,
  VEHICLE_CHEVRON_LAYER,
  VEHICLE_LABEL_LAYER,
] as const;

const mapsNeedingVehicleLayerRaise = new WeakSet<MapLibreMap>();

type VehicleFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: { type: "Point"; coordinates: OpsCoordinate };
    properties: {
      vehicleId: string;
      callsign: string;
      heading: number;
      tone: OpsMarkerTone;
      selected: boolean;
      anySelected: boolean;
    };
  }>;
};

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

export function isValidCoordinate(longitude: number, latitude: number): boolean {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export function isValidOpsCoordinate([longitude, latitude]: OpsCoordinate): boolean {
  return isValidCoordinate(longitude, latitude);
}

export function filterValidCoordinates(coordinates: OpsCoordinate[]): OpsCoordinate[] {
  return coordinates.filter(isValidOpsCoordinate);
}

export function groupSamplesIntoLines(
  samples: ReadonlyArray<{ vehicle_id: string; latitude: number | null; longitude: number | null }>,
): OpsLine[] {
  const byVehicle = new Map<string, OpsCoordinate[]>();
  for (const sample of samples) {
    if (!isValidCoordinate(sample.longitude ?? NaN, sample.latitude ?? NaN)) continue;
    const history = byVehicle.get(sample.vehicle_id) ?? [];
    history.push([sample.longitude!, sample.latitude!]);
    byVehicle.set(sample.vehicle_id, history);
  }
  return [...byVehicle.entries()]
    .map(([id, coordinates]) => ({ id, coordinates }))
    .filter((line) => line.coordinates.length > 1);
}

export function buildLineFeatureCollection(lines: OpsLine[]): LineFeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines
      .map((line) => ({
        ...line,
        coordinates: filterValidCoordinates(line.coordinates),
      }))
      .filter((line) => line.coordinates.length > 1)
      .map((line) => ({
        type: "Feature" as const,
        properties: { id: line.id },
        geometry: { type: "LineString" as const, coordinates: line.coordinates },
      })),
  };
}

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

function lineLayerAnchor(map: MapLibreMap): string | undefined {
  return map.getLayer(VEHICLE_HALO_CASING_LAYER) ? VEHICLE_HALO_CASING_LAYER : undefined;
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

  const data = buildLineFeatureCollection(lines);
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    const layer = map.getLayer(layerId);
    if (layer) {
      for (const [key, value] of Object.entries(paint)) {
        map.setPaintProperty(layerId, key as keyof typeof paint, value);
      }
    }
    mapsNeedingVehicleLayerRaise.add(map);
    return true;
  }

  map.addSource(sourceId, { type: "geojson", data });
  const beforeId = lineLayerAnchor(map);
  map.addLayer(
    {
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
    },
    beforeId,
  );
  map.addLayer(
    {
      id: layerId,
      type: "line",
      source: sourceId,
      paint,
      layout: { "line-cap": "round", "line-join": "round" },
    },
    beforeId,
  );
  return true;
}

/** Sync multiple line groups in one style-ready pass (avoids repeated layer-order work). */
export function syncLineLayers(
  map: MapLibreMap,
  layers: Array<{
    sourceId: string;
    layerId?: string;
    lines: OpsLine[];
    paint: NonNullable<LineLayerSpecification["paint"]>;
  }>,
): boolean {
  if (!map.isStyleLoaded()) return false;
  for (const layer of layers) {
    updateLineGeoJson(map, layer);
  }
  raiseVehicleLayersIfNeeded(map);
  return true;
}

export function runWhenStyleReady(map: MapLibreMap, update: () => void): () => void {
  if (map.isStyleLoaded()) {
    update();
    return () => undefined;
  }
  map.once("load", update);
  return () => map.off("load", update);
}

/** @deprecated Use {@link runWhenStyleReady}. */
export const updateWhenStyleReady = runWhenStyleReady;

export function fitCoordinates(
  map: MapLibreMap,
  coordinates: OpsCoordinate[],
  { padding = 72, maxZoom = 13, duration = 0 }: { padding?: number; maxZoom?: number; duration?: number } = {},
): void {
  const valid = filterValidCoordinates(coordinates);
  if (valid.length === 0) return;
  if (valid.length === 1) {
    map.easeTo({ center: valid[0], zoom: Math.min(maxZoom, 12.5), duration });
    return;
  }
  const bounds = new LngLatBounds();
  for (const coordinate of valid) bounds.extend(coordinate);
  map.fitBounds(bounds, { padding, maxZoom, duration });
}

export function focusMapOnPoint(
  map: MapLibreMap,
  longitude: number,
  latitude: number,
  { minZoom = 12, duration = 400 }: { minZoom?: number; duration?: number } = {},
): boolean {
  if (!isValidCoordinate(longitude, latitude)) return false;
  map.easeTo({
    center: [longitude, latitude],
    zoom: Math.max(map.getZoom(), minZoom),
    duration,
    essential: true,
  });
  return true;
}

export function buildVehicleFeatureCollection(vehicles: VehicleMapPoint[]): VehicleFeatureCollection {
  const visible = vehicles.filter((vehicle) => isValidCoordinate(vehicle.longitude, vehicle.latitude));
  const anySelected = visible.some((vehicle) => vehicle.selected);
  return {
    type: "FeatureCollection",
    features: visible.map((vehicle) => ({
      type: "Feature",
      id: vehicle.vehicleId,
      geometry: { type: "Point", coordinates: [vehicle.longitude, vehicle.latitude] },
      properties: {
        vehicleId: vehicle.vehicleId,
        callsign: vehicle.callsign,
        heading: Number.isFinite(vehicle.headingDeg) ? vehicle.headingDeg : 0,
        tone: vehicle.tone,
        selected: vehicle.selected,
        anySelected,
      },
    })),
  };
}

const VEHICLE_OPACITY: ExpressionSpecification = [
  "case",
  ["==", ["get", "selected"], true],
  1,
  ["==", ["get", "anySelected"], true],
  0.5,
  0.95,
];

const VEHICLE_TONE_RING: ExpressionSpecification = [
  "match",
  ["get", "tone"],
  "healthy",
  "rgba(46, 125, 74, 0.85)",
  "degraded",
  "rgba(166, 124, 28, 0.9)",
  "critical",
  "rgba(140, 40, 40, 0.95)",
  "rgba(31, 95, 139, 0.55)",
];

function ensureVehicleLayers(map: MapLibreMap): void {
  if (!map.getSource(VEHICLE_SOURCE_ID)) {
    map.addSource(VEHICLE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      promoteId: "vehicleId",
    });
  }

  if (!map.getLayer(VEHICLE_HALO_CASING_LAYER)) {
    map.addLayer({
      id: VEHICLE_HALO_CASING_LAYER,
      type: "circle",
      source: VEHICLE_SOURCE_ID,
      paint: {
        "circle-radius": 14,
        "circle-color": VEHICLE_TONE_RING,
        "circle-opacity": ["*", VEHICLE_OPACITY, 0.35],
      },
    });
  }

  if (!map.getLayer(VEHICLE_HALO_LAYER)) {
    map.addLayer({
      id: VEHICLE_HALO_LAYER,
      type: "circle",
      source: VEHICLE_SOURCE_ID,
      paint: {
        "circle-radius": ["case", ["==", ["get", "selected"], true], 12, 11],
        "circle-color": "#f4f6f8",
        "circle-opacity": VEHICLE_OPACITY,
        "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 2.5, 2],
        "circle-stroke-color": "#0b1220",
      },
    });
  }

  if (!map.getLayer(VEHICLE_CHEVRON_LAYER)) {
    map.addLayer({
      id: VEHICLE_CHEVRON_LAYER,
      type: "symbol",
      source: VEHICLE_SOURCE_ID,
      layout: {
        "text-field": "▲",
        "text-size": 13,
        "text-rotate": ["get", "heading"],
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "map",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#0b1220",
        "text-opacity": VEHICLE_OPACITY,
      },
    });
  }

  if (!map.getLayer(VEHICLE_LABEL_LAYER)) {
    map.addLayer({
      id: VEHICLE_LABEL_LAYER,
      type: "symbol",
      source: VEHICLE_SOURCE_ID,
      filter: ["==", ["get", "selected"], true],
      layout: {
        "text-field": ["get", "callsign"],
        "text-size": 10,
        "text-offset": [0, 1.35],
        "text-anchor": "top",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#f1f2f3",
        "text-halo-color": "rgba(10, 11, 13, 0.92)",
        "text-halo-width": 1.2,
      },
    });
  }
}

function raiseVehicleLayersIfNeeded(map: MapLibreMap): void {
  if (!mapsNeedingVehicleLayerRaise.has(map)) return;
  for (const layerId of VEHICLE_LAYER_STACK) {
    if (map.getLayer(layerId)) map.moveLayer(layerId);
  }
  mapsNeedingVehicleLayerRaise.delete(map);
}

/** Render fleet positions as map layers (stable under zoom; avoids HTML marker drift). */
export function syncVehicleLayer(map: MapLibreMap, vehicles: VehicleMapPoint[]): boolean {
  if (!map.isStyleLoaded()) return false;
  ensureVehicleLayers(map);
  const source = map.getSource(VEHICLE_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(buildVehicleFeatureCollection(vehicles));
  raiseVehicleLayersIfNeeded(map);
  return true;
}

export function bindVehicleLayerSelection(map: MapLibreMap, onSelect: (vehicleId: string) => void): () => void {
  const layers = [VEHICLE_CHEVRON_LAYER, VEHICLE_HALO_LAYER];
  let attached = false;
  let disposed = false;

  const handleClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const vehicleId = feature?.properties?.vehicleId;
    if (typeof vehicleId === "string") onSelect(vehicleId);
  };
  const handleEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };
  const handleLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  const attach = () => {
    if (attached || disposed || !map.getLayer(VEHICLE_CHEVRON_LAYER)) return;
    attached = true;
    for (const layer of layers) {
      map.on("click", layer, handleClick);
      map.on("mouseenter", layer, handleEnter);
      map.on("mouseleave", layer, handleLeave);
    }
  };

  const detach = () => {
    if (!attached) return;
    attached = false;
    for (const layer of layers) {
      map.off("click", layer, handleClick);
      map.off("mouseenter", layer, handleEnter);
      map.off("mouseleave", layer, handleLeave);
    }
    map.getCanvas().style.cursor = "";
  };

  if (map.isStyleLoaded()) attach();
  else map.once("load", attach);

  const onVehicleLayerReady = () => attach();
  map.on("data", onVehicleLayerReady);

  return () => {
    disposed = true;
    map.off("load", attach);
    map.off("data", onVehicleLayerReady);
    detach();
  };
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
