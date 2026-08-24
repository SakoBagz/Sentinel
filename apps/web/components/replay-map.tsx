"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef } from "react";

import type { ReplayVehicle } from "@/lib/replay";
import type { TelemetrySample } from "@/lib/api";
import {
  filterValidCoordinates,
  fitCoordinates,
  focusMapOnPoint,
  groupSamplesIntoLines,
  OPS_REPLAY_TRAIL_PAINT,
  bindVehicleLayerSelection,
  syncLineLayers,
  syncVehicleLayer,
  type VehicleMapPoint,
} from "@/lib/ops-map";
import { useOpsMap, useSyncWhenStyleReady } from "@/hooks/use-ops-map";

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
  const { mapRef: map, ready } = useOpsMap(node);
  const fitted = useRef(false);
  const focusedVehicle = useRef<string | null>(null);

  const vehiclePoints = useMemo<VehicleMapPoint[]>(
    () =>
      current
        .filter((telemetry) => telemetry.latitude !== null && telemetry.longitude !== null)
        .map((telemetry) => ({
          vehicleId: telemetry.vehicle_id,
          longitude: telemetry.longitude!,
          latitude: telemetry.latitude!,
          headingDeg: telemetry.heading_deg ?? 0,
          callsign: callsigns[telemetry.vehicle_id] ?? telemetry.vehicle_id.slice(0, 8),
          tone: "neutral" as const,
          selected: selectedVehicleId ? selectedVehicleId === telemetry.vehicle_id : false,
        })),
    [current, selectedVehicleId, callsigns],
  );

  const trailLines = useMemo(() => groupSamplesIntoLines(samples), [samples]);

  const fitCoordinatesList = useMemo(
    () =>
      filterValidCoordinates(
        samples
          .filter((sample) => sample.latitude !== null && sample.longitude !== null)
          .map((sample) => [sample.longitude!, sample.latitude!] as const),
      ),
    [samples],
  );

  useEffect(() => {
    if (!ready) return;
    const instance = map.current;
    if (!instance) return;
    return bindVehicleLayerSelection(instance, onSelect);
  }, [ready, map, onSelect]);

  useSyncWhenStyleReady(
    map,
    (instance) => {
      syncVehicleLayer(instance, vehiclePoints);
      if (!fitted.current && fitCoordinatesList.length > 0) {
        fitCoordinates(instance, fitCoordinatesList, { padding: 70, maxZoom: 13, duration: 0 });
        fitted.current = true;
      }
    },
    [ready, vehiclePoints, fitCoordinatesList],
  );

  useEffect(() => {
    if (!ready) return;
    const instance = map.current;
    if (!instance || !selectedVehicleId) {
      focusedVehicle.current = selectedVehicleId || null;
      return;
    }
    if (focusedVehicle.current === selectedVehicleId) return;
    const focused = current.find((sample) => sample.vehicle_id === selectedVehicleId);
    focusedVehicle.current = selectedVehicleId;
    if (!focused || focused.latitude == null || focused.longitude == null) return;
    focusMapOnPoint(instance, focused.longitude, focused.latitude, { minZoom: 12, duration: 350 });
  }, [ready, selectedVehicleId, current, map]);

  useSyncWhenStyleReady(
    map,
    (instance) => {
      syncLineLayers(instance, [
        { sourceId: "sentinel-replay-trails", lines: trailLines, paint: OPS_REPLAY_TRAIL_PAINT },
      ]);
    },
    [ready, trailLines],
  );

  return <div className="map-canvas" ref={node} />;
}
