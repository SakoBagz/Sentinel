"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import { addVehicle, addWaypoint, getMission, Mission, updateMission } from "@/lib/api";

type Props = { missionId: string };

export function MissionPlanner({ missionId }: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedVehicleRef = useRef<string | null>(null);
  const missionRef = useRef<Mission | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!mission) return <main className="main"><div className="card">{error ?? "Loading mission…"}</div></main>;
  return (
    <main className="main">
      <div className="planner-heading"><div><div className="eyebrow">Mission planner</div><h1>{mission.name}</h1></div><button className="button primary" disabled={busy} onClick={saveMission}>Save mission</button></div>
      {error && <div className="notice error">{error}</div>}
      <div className="workspace">
        <aside className="rail"><div className="eyebrow">UAV fleet</div><form className="inline-form" onSubmit={handleAddVehicle}><input aria-label="Callsign" placeholder="UAV-004" value={callsign} onChange={(event) => setCallsign(event.target.value)} /><button className="button" disabled={busy}>Add</button></form><div className="list">{mission.vehicles.map((vehicle) => <button className={`list-item selectable ${selectedVehicle === vehicle.id ? "selected" : ""}`} key={vehicle.id} onClick={() => setSelectedVehicle(vehicle.id)}><strong>{vehicle.callsign}</strong><span>{vehicle.vehicle_type} · {mission.waypoints.filter((item) => item.vehicle_id === vehicle.id).length} waypoints</span></button>)}</div></aside>
        <section className="map-shell"><div ref={mapNode} className="map-canvas" /><div className="map-hint">Select a UAV, then click the map to place a waypoint.</div></section>
        <aside className="inspector"><div className="eyebrow">Mission config</div><label className="field">Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><div className="metric"><span>Status</span><strong>{mission.status}</strong></div><div className="metric"><span>Vehicles</span><strong>{mission.vehicles.length}</strong></div><div className="metric"><span>Waypoints</span><strong>{mission.waypoints.length}</strong></div></aside>
      </div>
    </main>
  );
}
