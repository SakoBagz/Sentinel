"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { ReplayVehicle } from "@/lib/replay";
import type { TelemetrySample } from "@/lib/api";

export function ReplayMap({ samples, current, callsigns, selectedVehicleId, onSelect }: { samples: TelemetrySample[]; current: ReplayVehicle[]; callsigns: Record<string, string>; selectedVehicleId: string; onSelect: (vehicleId: string) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const fitted = useRef(false);

  useEffect(() => {
    if (!node.current || map.current) return;
    const instance = new maplibregl.Map({ container: node.current, style: "https://tiles.openfreemap.org/styles/liberty", center: [-118.24, 34.15], zoom: 10 });
    instance.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || samples.length === 0 || fitted.current) return;
    const coordinates = samples.filter((sample) => sample.latitude !== null && sample.longitude !== null);
    if (coordinates.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const sample of coordinates) bounds.extend([sample.longitude!, sample.latitude!]);
      if (coordinates.length === 1) instance.setCenter([coordinates[0].longitude!, coordinates[0].latitude!]);
      else instance.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 0 });
      fitted.current = true;
    }
  }, [samples]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const [vehicleId, telemetry] of Object.entries(Object.fromEntries(current.map((sample) => [sample.vehicle_id, sample])))) {
      if (telemetry.latitude === null || telemetry.longitude === null) continue;
      const marker = markers.current[vehicleId] ?? new maplibregl.Marker({ color: "#d9dde1" }).setLngLat([telemetry.longitude, telemetry.latitude]).addTo(instance);
      marker.setLngLat([telemetry.longitude, telemetry.latitude]).setPopup(new maplibregl.Popup().setText(callsigns[vehicleId] ?? vehicleId));
      marker.getElement().setAttribute("role", "button");
      marker.getElement().setAttribute("aria-label", `${callsigns[vehicleId] ?? vehicleId} replay position`);
      marker.getElement().style.opacity = selectedVehicleId && selectedVehicleId !== vehicleId ? "0.42" : "1";
      marker.getElement().onclick = () => onSelect(vehicleId);
      marker.getElement().tabIndex = 0;
      marker.getElement().onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(vehicleId); } };
      markers.current[vehicleId] = marker;
    }
    for (const [vehicleId, marker] of Object.entries(markers.current)) {
      if (!current.some((sample) => sample.vehicle_id === vehicleId)) { marker.remove(); delete markers.current[vehicleId]; }
    }
  }, [current, selectedVehicleId, callsigns, onSelect]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const updateTrail = () => {
      if (!instance.isStyleLoaded()) return;
      const byVehicle = new Map<string, TelemetrySample[]>();
      for (const sample of samples) {
        if (sample.latitude === null || sample.longitude === null) continue;
        byVehicle.set(sample.vehicle_id, [...(byVehicle.get(sample.vehicle_id) ?? []), sample]);
      }
      const features = [...byVehicle.entries()].filter(([, history]) => history.length > 1).map(([vehicleId, history]) => ({ type: "Feature" as const, properties: { vehicleId }, geometry: { type: "LineString" as const, coordinates: history.map((sample) => [sample.longitude!, sample.latitude!]) } }));
      const sourceId = "sentinel-replay-trails";
      const source = instance.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData({ type: "FeatureCollection", features } as GeoJSON.FeatureCollection);
      else {
        instance.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features } });
        instance.addLayer({ id: "sentinel-replay-trails-line", type: "line", source: sourceId, paint: { "line-color": "#aeb5bc", "line-width": 2, "line-opacity": 0.62 } });
      }
    };
    if (instance.isStyleLoaded()) updateTrail();
    else instance.once("load", updateTrail);
    return () => { instance.off("load", updateTrail); };
  }, [samples]);

  return <div className="map-canvas" ref={node} />;
}
