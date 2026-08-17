"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { addVehicle, addWaypoint, createRun, deleteWaypoint, getMission, Mission, updateMission, updateWaypoint, Waypoint } from "@/lib/api";
import { evaluateMissionReadiness } from "@/lib/mission-readiness";

type Props = { missionId: string };

export function MissionPlanner({ missionId }: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedVehicleRef = useRef<string | null>(null);
  const missionRef = useRef<Mission | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basemapReady, setBasemapReady] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const router = useRouter();

  const reload = useCallback(async () => {
    const loaded = await getMission(missionId);
    setMission(loaded);
    setName(loaded.name);
    if (!selectedVehicleRef.current && loaded.vehicles[0]) {
      selectedVehicleRef.current = loaded.vehicles[0].id;
      setSelectedVehicle(loaded.vehicles[0].id);
    }
  }, [missionId]);

  useEffect(() => {
    reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load mission"));
  }, [missionId, reload]);

  useEffect(() => {
    selectedVehicleRef.current = selectedVehicle || null;
  }, [selectedVehicle]);

  useEffect(() => {
    missionRef.current = mission;
  }, [mission]);

  const selectedWaypoint = mission?.waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null;
  const missionLoaded = mission !== null;
  const fleetVehicleIds = new Set(mission?.vehicles.map((vehicle) => vehicle.id));
  const routedVehicleIds = new Set(mission?.waypoints.map((waypoint) => waypoint.vehicle_id).filter((vehicleId): vehicleId is string => vehicleId !== null && fleetVehicleIds.has(vehicleId)));
  const hasSharedRoute = mission?.waypoints.some((waypoint) => waypoint.vehicle_id === null) ?? false;
  const readiness = evaluateMissionReadiness({
    name,
    vehicleCount: mission?.vehicles.length ?? 0,
    routedVehicleCount: routedVehicleIds.size,
    hasSharedRoute,
    mapReady: basemapReady,
  });
  const firstReadinessBlocker = readiness.checks.find((check) => !check.ready);

  useEffect(() => {
    if (!missionLoaded || !mapNode.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-118.24, 34.15],
      zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("idle", () => {
      if (map.queryRenderedFeatures().length > 0) setBasemapReady(true);
    });
    map.on("error", () => setBasemapError(true));
    map.on("click", async (event) => {
      const vehicleId = selectedVehicleRef.current;
      const currentMission = missionRef.current;
      if (!vehicleId || !currentMission) return;
      const vehicleWaypoints = currentMission.waypoints.filter((item) => item.vehicle_id === vehicleId);
      setBusy(true);
      setError(null);
      try {
        await addWaypoint(currentMission.id, {
          vehicle_id: vehicleId,
          sequence: vehicleWaypoints.length,
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
          altitude_m: 100,
          action: "SURVEY",
        });
        await reload();
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : "Unable to add waypoint");
      } finally {
        setBusy(false);
      }
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [missionLoaded, reload]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mission) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = mission.waypoints.map((waypoint) => {
    const marker = new maplibregl.Marker({ color: "#53c7a3" })
      .setDraggable(true)
        .setLngLat([waypoint.longitude, waypoint.latitude])
        .setPopup(new maplibregl.Popup().setText(`Waypoint ${waypoint.sequence + 1} · ${waypoint.action}`))
        .addTo(map);
      marker.getElement().addEventListener("click", () => {
        setSelectedWaypointId(waypoint.id);
        setSelectedVehicle(waypoint.vehicle_id ?? "");
      });
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        setMission((current) => current && ({
          ...current,
          waypoints: current.waypoints.map((item) => item.id === waypoint.id ? { ...item, latitude: position.lat, longitude: position.lng } : item),
        }));
      });
      return marker;
    });
  }, [mission]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mission) return;
    const updateRoutes = () => {
      if (!map.isStyleLoaded()) return;
      const byVehicle = new Map<string, Waypoint[]>();
      for (const waypoint of [...mission.waypoints].sort((left, right) => left.sequence - right.sequence)) {
        if (!waypoint.vehicle_id) continue;
        byVehicle.set(waypoint.vehicle_id, [...(byVehicle.get(waypoint.vehicle_id) ?? []), waypoint]);
      }
      const features = [...byVehicle.entries()]
        .filter(([, waypoints]) => waypoints.length > 1)
        .map(([vehicleId, waypoints]) => ({
          type: "Feature" as const,
          properties: { vehicleId },
          geometry: { type: "LineString" as const, coordinates: waypoints.map((item) => [item.longitude, item.latitude]) },
        }));
      const sourceId = "sentinel-planner-routes";
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData({ type: "FeatureCollection", features } as GeoJSON.FeatureCollection);
      else {
        map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features } });
        map.addLayer({ id: "sentinel-planner-routes-line", type: "line", source: sourceId, paint: { "line-color": "#53c7a3", "line-width": 3, "line-opacity": 0.8 } });
      }
    };
    if (map.isStyleLoaded()) updateRoutes();
    else map.once("load", updateRoutes);
    return () => { map.off("load", updateRoutes); };
  }, [mission]);

  const saveMission = async () => {
    setBusy(true); setError(null);
    try { setMission(await updateMission(missionId, { name })); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to save mission"); }
    finally { setBusy(false); }
  };

  const handleAddVehicle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!callsign.trim()) return;
    setBusy(true); setError(null);
    try {
      const vehicle = await addVehicle(missionId, { callsign: callsign.trim(), vehicle_type: "SURVEY", starting_latitude: 34.15, starting_longitude: -118.24, starting_altitude_m: 100 });
      setCallsign(""); selectedVehicleRef.current = vehicle.id; setSelectedVehicle(vehicle.id); await reload();
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to add vehicle"); }
    finally { setBusy(false); }
  };

  const startSimulation = async () => {
    setBusy(true); setError(null);
    try {
      const run = await createRun(missionId);
      router.push(`/runs/${run.id}/live`);
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to create run"); }
    finally { setBusy(false); }
  };

  const saveWaypoint = async () => {
    if (!selectedWaypoint) return;
    setBusy(true); setError(null);
    try {
      await updateWaypoint(selectedWaypoint.id, {
        latitude: selectedWaypoint.latitude,
        longitude: selectedWaypoint.longitude,
        altitude_m: selectedWaypoint.altitude_m,
        target_speed_mps: selectedWaypoint.target_speed_mps ?? undefined,
        arrival_radius_m: selectedWaypoint.arrival_radius_m ?? undefined,
        action: selectedWaypoint.action,
      });
      await reload();
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to save waypoint"); }
    finally { setBusy(false); }
  };

  const removeSelectedWaypoint = async () => {
    if (!selectedWaypoint) return;
    setBusy(true); setError(null);
    try { await deleteWaypoint(selectedWaypoint.id); setSelectedWaypointId(null); await reload(); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to delete waypoint"); }
    finally { setBusy(false); }
  };

  if (!mission) return <main className="main"><div className="card">{error ?? "Loading mission…"}</div></main>;
  return (
    <main className="main">
      <div className="planner-heading"><div><div className="eyebrow">Mission planner</div><h1>{mission.name}</h1></div><div className="actions compact"><button className="button" disabled={busy} onClick={saveMission}>Save mission</button><button className="button primary" disabled={busy || !readiness.ready} title={firstReadinessBlocker?.detail} onClick={startSimulation}>Start simulation</button></div></div>
      {error && <div className="notice error">{error}</div>}
      <section className="readiness-grid" aria-label="Mission readiness">
        <div className="card readiness-card" data-readiness={readiness.ready ? "ready" : "blocked"}>
          <div className="readiness-header"><div><div className="eyebrow">Mission readiness</div><h2>{readiness.ready ? "Ready to launch" : "Needs attention"}</h2></div><span className={`readiness-status ${readiness.ready ? "ready" : "blocked"}`} role="status"><span className="status-dot" />{readiness.ready ? "GO" : "HOLD"}</span></div>
          <div className="readiness-list">{readiness.checks.map((check) => <div className={`readiness-row ${check.ready ? "ready" : "blocked"}`} key={check.id}><span className="readiness-icon" aria-hidden="true">{check.ready ? "✓" : "!"}</span><div><strong>{check.label}</strong><span>{check.detail}</span></div></div>)}</div>
        </div>
        <div className="card safety-card"><div className="eyebrow">Safety boundary</div><h2>Simulation-only operations</h2><p>No vehicle control, targeting, engagement, or weaponized payload capability exists in the product contract.</p><div className="safety-label"><span className="status-dot" /> Read-only mission analysis</div></div>
      </section>
      <div className="workspace">
        <aside className="rail"><div className="eyebrow">UAV fleet</div><form className="inline-form" onSubmit={handleAddVehicle}><input aria-label="Callsign" placeholder="UAV-004" value={callsign} onChange={(event) => setCallsign(event.target.value)} /><button className="button" disabled={busy}>Add</button></form><div className="list">{mission.vehicles.map((vehicle) => <button className={`list-item selectable ${selectedVehicle === vehicle.id ? "selected" : ""}`} key={vehicle.id} onClick={() => setSelectedVehicle(vehicle.id)}><strong>{vehicle.callsign}</strong><span>{vehicle.vehicle_type} · {mission.waypoints.filter((item) => item.vehicle_id === vehicle.id).length} waypoints</span></button>)}</div></aside>
        <section className="map-shell"><div ref={mapNode} className="map-canvas" data-basemap-ready={basemapReady} /><div className={`map-hint ${basemapError ? "error" : ""}`}>{basemapError ? "Basemap unavailable. Check the map connection and retry." : basemapReady ? "Select a UAV, then click the map to place a waypoint." : "Loading basemap…"}</div></section>
        <aside className="inspector"><div className="eyebrow">Mission config</div><label className="field">Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><div className="metric"><span>Status</span><strong>{mission.status}</strong></div><div className="metric"><span>Vehicles</span><strong>{mission.vehicles.length}</strong></div><div className="metric"><span>Waypoints</span><strong>{mission.waypoints.length}</strong></div>{selectedWaypoint && <div className="failure-panel"><div className="eyebrow">Selected waypoint</div><div className="card-copy">Route point {selectedWaypoint.sequence + 1} · {selectedWaypoint.action}</div><label className="field">Latitude<input type="number" step="0.000001" value={selectedWaypoint.latitude} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, latitude: Number(event.target.value) } : item) }))} /></label><label className="field">Longitude<input type="number" step="0.000001" value={selectedWaypoint.longitude} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, longitude: Number(event.target.value) } : item) }))} /></label><label className="field">Altitude (m)<input type="number" min={0} value={selectedWaypoint.altitude_m} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, altitude_m: Number(event.target.value) } : item) }))} /></label><label className="field">Action<select value={selectedWaypoint.action} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, action: event.target.value as Waypoint["action"] } : item) }))}><option value="TRANSIT">TRANSIT</option><option value="HOLD">HOLD</option><option value="SURVEY">SURVEY</option><option value="RETURN">RETURN</option></select></label><div className="actions compact"><button className="button" disabled={busy} onClick={saveWaypoint}>Save point</button><button className="button" disabled={busy} onClick={removeSelectedWaypoint}>Delete</button></div></div>}</aside>
      </div>
    </main>
  );
}
