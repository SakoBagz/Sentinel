import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type LineLayerSpecification,
  type MapOptions,
  type Marker,
} from "maplibre-gl";

export type OpsCoordinate = [number, number];

export type OpsLine = {
  id: string;
  coordinates: OpsCoordinate[];
};

type LineFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: string };
    geometry: { type: "LineString"; coordinates: OpsCoordinate[] };
  }>;
};

export const OPS_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const OPS_MAP_CENTER: OpsCoordinate = [-118.24, 34.15];

export function createOpsMap(
  container: HTMLElement,
  options: Partial<Omit<MapOptions, "container">> = {},
): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: OPS_MAP_STYLE,
    center: OPS_MAP_CENTER,
    zoom: 10,
    ...options,
  });
  map.addControl(new NavigationControl(), "top-right");
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
    return true;
  }

  map.addSource(sourceId, { type: "geojson", data });
  map.addLayer({ id: layerId, type: "line", source: sourceId, paint });
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

export function makeMarkerInteractive(marker: Marker, label: string, onSelect: () => void): void {
  const element = marker.getElement();
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", label);
  element.tabIndex = 0;
  element.onclick = onSelect;
  element.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
}

export function updateMarkerHeading(marker: Marker, headingDeg: number): void {
  const element = marker.getElement();
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
  marker.getElement().style.opacity = selected ? "1" : "0.42";
}
