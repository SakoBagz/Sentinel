"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { LngLatBounds, Marker, Popup, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { ReplayVehicle } from "@/lib/replay";
import type { TelemetrySample } from "@/lib/api";
import {
  createOpsMap,
  makeMarkerInteractive,
  setMarkerSelected,
  updateLineGeoJson,
  updateMarkerHeading,
  updateWhenStyleReady,
  type OpsLine,
} from "@/lib/ops-map";

export function ReplayMap({ samples, current, callsigns, selectedVehicleId, onSelect }: { samples: TelemetrySample[]; current: ReplayVehicle[]; callsigns: Record<string, string>; selectedVehicleId: string; onSelect: (vehicleId: string) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const fitted = useRef(false);

  useEffect(() => {
    if (!node.current || map.current) return;
    const instance = createOpsMap(node.current);
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || samples.length === 0 || fitted.current) return;
    const coordinates = samples.filter((sample) => sample.latitude !== null && sample.longitude !== null);
    if (coordinates.length > 0) {
      const bounds = new LngLatBounds();
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
      const marker = markers.current[vehicleId] ?? new Marker({ color: "#d9dde1" }).setLngLat([telemetry.longitude, telemetry.latitude]).addTo(instance);
      marker.setLngLat([telemetry.longitude, telemetry.latitude]).setPopup(new Popup().setText(callsigns[vehicleId] ?? vehicleId));
      makeMarkerInteractive(marker, `${callsigns[vehicleId] ?? vehicleId} replay position`, () => onSelect(vehicleId));
      updateMarkerHeading(marker, telemetry.heading_deg ?? 0);
      setMarkerSelected(marker, !selectedVehicleId || selectedVehicleId === vehicleId);
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
      const byVehicle = new Map<string, TelemetrySample[]>();
      for (const sample of samples) {
        if (sample.latitude === null || sample.longitude === null) continue;
        byVehicle.set(sample.vehicle_id, [...(byVehicle.get(sample.vehicle_id) ?? []), sample]);
      }
      const lines: OpsLine[] = [...byVehicle.entries()].map(([id, history]) => ({
        id,
        coordinates: history.map((sample) => [sample.longitude!, sample.latitude!]),
      }));
      updateLineGeoJson(instance, {
        sourceId: "sentinel-replay-trails",
        lines,
        paint: { "line-color": "#aeb5bc", "line-width": 2, "line-opacity": 0.62 },
      });
    };
    return updateWhenStyleReady(instance, updateTrail);
  }, [samples]);

  return <div className="map-canvas" ref={node} />;
}
