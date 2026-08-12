"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { addVehicle, addWaypoint, createRun, deleteWaypoint, getMission, Mission, updateMission, updateWaypoint, Waypoint } from "@/lib/api";

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

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-118.24, 34.15],
      zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
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
  }, [reload]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mission) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = mission.waypoints.map((waypoint) => {
      const marker = new maplibregl.Marker({ color: "#53c7a3" })
        .setLngLat([waypoint.longitude, waypoint.latitude])
        .setPopup(new maplibregl.Popup().setText(`Waypoint ${waypoint.sequence + 1} · ${waypoint.action}`))
        .addTo(map);
      marker.getElement().addEventListener("click", () => {
        setSelectedWaypointId(waypoint.id);
        setSelectedVehicle(waypoint.vehicle_id ?? "");
      });
      return marker;
    });
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
      <div className="planner-heading"><div><div className="eyebrow">Mission planner</div><h1>{mission.name}</h1></div><div className="actions compact"><button className="button" disabled={busy} onClick={saveMission}>Save mission</button><button className="button primary" disabled={busy || mission.vehicles.length === 0} onClick={startSimulation}>Start simulation</button></div></div>
      {error && <div className="notice error">{error}</div>}
      <div className="workspace">
        <aside className="rail"><div className="eyebrow">UAV fleet</div><form className="inline-form" onSubmit={handleAddVehicle}><input aria-label="Callsign" placeholder="UAV-004" value={callsign} onChange={(event) => setCallsign(event.target.value)} /><button className="button" disabled={busy}>Add</button></form><div className="list">{mission.vehicles.map((vehicle) => <button className={`list-item selectable ${selectedVehicle === vehicle.id ? "selected" : ""}`} key={vehicle.id} onClick={() => setSelectedVehicle(vehicle.id)}><strong>{vehicle.callsign}</strong><span>{vehicle.vehicle_type} · {mission.waypoints.filter((item) => item.vehicle_id === vehicle.id).length} waypoints</span></button>)}</div></aside>
        <section className="map-shell"><div ref={mapNode} className="map-canvas" /><div className="map-hint">Select a UAV, then click the map to place a waypoint.</div></section>
        <aside className="inspector"><div className="eyebrow">Mission config</div><label className="field">Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><div className="metric"><span>Status</span><strong>{mission.status}</strong></div><div className="metric"><span>Vehicles</span><strong>{mission.vehicles.length}</strong></div><div className="metric"><span>Waypoints</span><strong>{mission.waypoints.length}</strong></div>{selectedWaypoint && <div className="failure-panel"><div className="eyebrow">Selected waypoint</div><div className="card-copy">Route point {selectedWaypoint.sequence + 1} · {selectedWaypoint.action}</div><label className="field">Latitude<input type="number" step="0.000001" value={selectedWaypoint.latitude} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, latitude: Number(event.target.value) } : item) }))} /></label><label className="field">Longitude<input type="number" step="0.000001" value={selectedWaypoint.longitude} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, longitude: Number(event.target.value) } : item) }))} /></label><label className="field">Altitude (m)<input type="number" min={0} value={selectedWaypoint.altitude_m} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, altitude_m: Number(event.target.value) } : item) }))} /></label><label className="field">Action<select value={selectedWaypoint.action} onChange={(event) => setMission((current) => current && ({ ...current, waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, action: event.target.value as Waypoint["action"] } : item) }))}><option value="TRANSIT">TRANSIT</option><option value="HOLD">HOLD</option><option value="SURVEY">SURVEY</option><option value="RETURN">RETURN</option></select></label><div className="actions compact"><button className="button" disabled={busy} onClick={saveWaypoint}>Save point</button><button className="button" disabled={busy} onClick={removeSelectedWaypoint}>Delete</button></div></div>}</aside>
      </div>
    </main>
  );
}
