"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { ReplayVehicle } from "@/lib/replay";
import type { TelemetrySample } from "@/lib/api";
import {
  createOpsMap,
  fitCoordinates,
  OPS_REPLAY_TRAIL_PAINT,
  updateLineGeoJson,
  updateWhenStyleReady,
  upsertVehicleMarker,
  type OpsLine,
} from "@/lib/ops-map";

export function ReplayMap({
  samples,
  current,
  callsigns,
  selectedVehicleId,
  onSelect,
}: {
  samples: TelemetrySample[];
  current: ReplayVehicle[];
  callsigns: Record<string, string>;
  selectedVehicleId: string;
  onSelect: (vehicleId: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const fitted = useRef(false);
  const focusedVehicle = useRef<string | null>(null);

  useEffect(() => {
    if (!node.current || map.current) return;
    const instance = createOpsMap(node.current);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      markers.current = {};
      fitted.current = false;
      focusedVehicle.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || samples.length === 0 || fitted.current) return;
    const coordinates = samples
      .filter((sample) => sample.latitude !== null && sample.longitude !== null)
      .map((sample) => [sample.longitude!, sample.latitude!] as [number, number]);
    if (coordinates.length === 0) return;
    const applyFit = () => {
      fitCoordinates(instance, coordinates, { padding: 70, maxZoom: 13, duration: 0 });
      fitted.current = true;
    };
    return updateWhenStyleReady(instance, applyFit);
  }, [samples]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const activeIds = new Set<string>();
    for (const telemetry of current) {
      if (telemetry.latitude === null || telemetry.longitude === null) continue;
      activeIds.add(telemetry.vehicle_id);
      upsertVehicleMarker({
        map: instance,
        markers: markers.current,
        vehicleId: telemetry.vehicle_id,
        longitude: telemetry.longitude,
        latitude: telemetry.latitude,
        callsign: callsigns[telemetry.vehicle_id] ?? telemetry.vehicle_id.slice(0, 8),
        headingDeg: telemetry.heading_deg ?? 0,
        tone: "neutral",
        selected: selectedVehicleId ? selectedVehicleId === telemetry.vehicle_id : false,
        onSelect: () => onSelect(telemetry.vehicle_id),
      });
    }
    for (const [vehicleId, marker] of Object.entries(markers.current)) {
      if (!activeIds.has(vehicleId)) {
        marker.remove();
        delete markers.current[vehicleId];
      }
    }
  }, [current, selectedVehicleId, callsigns, onSelect]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !selectedVehicleId) {
      focusedVehicle.current = selectedVehicleId || null;
      return;
    }
    if (focusedVehicle.current === selectedVehicleId) return;
    const focused = current.find((sample) => sample.vehicle_id === selectedVehicleId);
    focusedVehicle.current = selectedVehicleId;
    if (focused?.latitude == null || focused.longitude == null) return;
    instance.easeTo({
      center: [focused.longitude, focused.latitude],
      zoom: Math.max(instance.getZoom(), 12),
      duration: 350,
      essential: true,
    });
  }, [selectedVehicleId, current]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const updateTrail = () => {
      const byVehicle = new Map<string, TelemetrySample[]>();
      for (const sample of samples) {
        if (sample.latitude === null || sample.longitude === null) continue;
        const history = byVehicle.get(sample.vehicle_id) ?? [];
        history.push(sample);
        byVehicle.set(sample.vehicle_id, history);
      }
      const lines: OpsLine[] = [...byVehicle.entries()].map(([id, history]) => ({
        id,
        coordinates: history.map((sample) => [sample.longitude!, sample.latitude!]),
      }));
      updateLineGeoJson(instance, {
        sourceId: "sentinel-replay-trails",
        lines,
        paint: OPS_REPLAY_TRAIL_PAINT,
      });
    };
    return updateWhenStyleReady(instance, updateTrail);
  }, [samples]);

  return <div className="map-canvas" ref={node} />;
}
