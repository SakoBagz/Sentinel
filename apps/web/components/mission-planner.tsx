"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { AlertTriangle, Check, MapPin, Play, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { addVehicle, addWaypoint, createRun, deleteWaypoint, getMission, Mission, updateMission, updateWaypoint, Waypoint } from "@/lib/api";
import { evaluateMissionReadiness } from "@/lib/mission-readiness";

type Props = { missionId: string };

function ReadinessPanel({ readiness }: { readiness: ReturnType<typeof evaluateMissionReadiness> }) {
  return (
    <section className="readiness-grid" aria-label="Mission readiness">
      <div className="card readiness-card" data-readiness={readiness.ready ? "ready" : "blocked"}>
        <div className="readiness-header">
          <div><div className="eyebrow">Preflight gate</div><h2>{readiness.ready ? "Ready to create a run" : "Resolve before launch"}</h2></div>
          <span className={`readiness-status ${readiness.ready ? "ready" : "blocked"}`} role="status"><span className="status-dot" />{readiness.ready ? "GO" : "HOLD"}</span>
        </div>
        <div className="readiness-list">
          {readiness.checks.map((check) => (
            <div className={`readiness-row ${check.ready ? "ready" : "blocked"}`} key={check.id}>
              <span className="readiness-icon" aria-hidden="true">{check.ready ? <Check size={12} /> : <AlertTriangle size={12} />}</span>
              <div><strong>{check.label}</strong><span>{check.detail}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="card safety-card">
        <div className="eyebrow">Product boundary</div>
        <h2>Simulation-only operations</h2>
        <p>This planner creates simulated runs only. It does not connect to aircraft, command vehicles, select targets, or control payloads.</p>
        <div className="safety-label"><span className="status-dot" /> Read-only mission analysis</div>
      </div>
    </section>
  );
}

export function MissionPlanner({ missionId }: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedVehicleRef = useRef<string | null>(null);
  const missionRef = useRef<Mission | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [busy, setBusy] = useState(false);
  const [waypointDirty, setWaypointDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basemapReady, setBasemapReady] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const router = useRouter();

  const reload = useCallback(async (syncName = false) => {
    const loaded = await getMission(missionId);
    setMission(loaded);
    if (syncName) setName(loaded.name);
    setWaypointDirty(false);
    if (!selectedVehicleRef.current && loaded.vehicles[0]) {
      selectedVehicleRef.current = loaded.vehicles[0].id;
      setSelectedVehicle(loaded.vehicles[0].id);
    }
  }, [missionId]);

  useEffect(() => {
    reload(true).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load mission"));
  }, [reload]);

  useEffect(() => { selectedVehicleRef.current = selectedVehicle || null; }, [selectedVehicle]);
  useEffect(() => { missionRef.current = mission; }, [mission]);

  const selectedWaypoint = mission?.waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null;
  const selectedVehicleDefinition = mission?.vehicles.find((vehicle) => vehicle.id === selectedVehicle) ?? null;
  const missionLoaded = mission !== null;
  const nameDirty = mission !== null && name.trim() !== mission.name;
  const hasUnsavedChanges = nameDirty || waypointDirty;
  const fleetVehicleIds = new Set(mission?.vehicles.map((vehicle) => vehicle.id));
  const routedVehicleIds = new Set(mission?.waypoints.map((waypoint) => waypoint.vehicle_id).filter((vehicleId): vehicleId is string => vehicleId !== null && fleetVehicleIds.has(vehicleId)));
  const hasSharedRoute = mission?.waypoints.some((waypoint) => waypoint.vehicle_id === null) ?? false;
  const readiness = evaluateMissionReadiness({
    name,
    nameSaved: !hasUnsavedChanges,
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
    map.on("error", () => { setBasemapError(true); setBasemapReady(false); });
    map.on("click", async (event) => {
      const vehicleId = selectedVehicleRef.current;
      const currentMission = missionRef.current;
      if (!vehicleId || !currentMission) {
        setError("Select a UAV in the fleet roster before placing a waypoint.");
        return;
      }
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
      const callsign = mission.vehicles.find((vehicle) => vehicle.id === waypoint.vehicle_id)?.callsign ?? "Unassigned UAV";
      const waypointLabel = `${callsign} · Waypoint ${waypoint.sequence + 1} · ${waypoint.action}`;
      const marker = new maplibregl.Marker({ color: "#d9dde1" })
        .setDraggable(true)
        .setLngLat([waypoint.longitude, waypoint.latitude])
        .setPopup(new maplibregl.Popup().setText(waypointLabel))
        .addTo(map);
      marker.getElement().setAttribute("role", "button");
      marker.getElement().setAttribute("aria-label", waypointLabel);
      const selectMarker = () => {
        setSelectedWaypointId(waypoint.id);
        setSelectedVehicle(waypoint.vehicle_id ?? "");
      };
      marker.getElement().addEventListener("click", selectMarker);
      marker.getElement().tabIndex = 0;
      marker.getElement().onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectMarker(); } };
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        setSelectedWaypointId(waypoint.id);
        setSelectedVehicle(waypoint.vehicle_id ?? "");
        setWaypointDirty(true);
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
        map.addLayer({ id: "sentinel-planner-routes-line", type: "line", source: sourceId, paint: { "line-color": "#d9dde1", "line-width": 3, "line-opacity": 0.82 } });
      }
    };
    if (map.isStyleLoaded()) updateRoutes();
    else map.once("load", updateRoutes);
    return () => { map.off("load", updateRoutes); };
  }, [mission]);

  const saveMission = async () => {
    if (!name.trim()) {
      setError("Mission name is required before saving.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const updated = await updateMission(missionId, { name: name.trim() });
      setMission(updated);
      setName(updated.name);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to save mission name");
    } finally {
      setBusy(false);
    }
  };

  const handleAddVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!callsign.trim()) return;
    setBusy(true); setError(null);
    try {
      const vehicle = await addVehicle(missionId, { callsign: callsign.trim(), vehicle_type: "SURVEY", starting_latitude: 34.15, starting_longitude: -118.24, starting_altitude_m: 100 });
      setCallsign("");
      selectedVehicleRef.current = vehicle.id;
      setSelectedVehicle(vehicle.id);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to add UAV");
    } finally {
      setBusy(false);
    }
  };

  const startSimulation = async () => {
    setBusy(true); setError(null);
    try {
      const run = await createRun(missionId);
      router.push(`/runs/${run.id}/live`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to create run");
      setBusy(false);
    }
  };

  const updateSelectedWaypoint = (patch: Partial<Waypoint>) => {
    if (!selectedWaypoint) return;
    setWaypointDirty(true);
    setMission((current) => current && ({
      ...current,
      waypoints: current.waypoints.map((item) => item.id === selectedWaypoint.id ? { ...item, ...patch } : item),
    }));
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
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to save waypoint changes");
    } finally {
      setBusy(false);
    }
  };

  const removeSelectedWaypoint = async () => {
    if (!selectedWaypoint) return;
    setBusy(true); setError(null);
    try {
      await deleteWaypoint(selectedWaypoint.id);
      setSelectedWaypointId(null);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to delete waypoint");
    } finally {
      setBusy(false);
    }
  };

  if (!mission) return <main className="main"><div className="surface loading-state" role="status">{error ?? "Loading mission definition…"}</div></main>;

  return (
    <main className="main">
      <PageHeader
        breadcrumbs={[{ label: "Missions", href: "/missions" }, { label: mission.name }]}
        eyebrow="Mission planner / definition"
        title={mission.name}
        description="Define the reusable mission configuration. Click the map to add a route point for the selected UAV; edits are local until you save them."
        status={<StatusBadge label={mission.status} tone={statusTone(mission.status)} />}
        actions={<>
          <button className="button" type="button" disabled={busy || !nameDirty} onClick={saveMission} title={nameDirty ? "Persist the edited mission name" : "Mission name is already saved"}><Save size={14} aria-hidden="true" /> Save mission name</button>
          <button className="button primary" type="button" disabled={busy || !readiness.ready} title={firstReadinessBlocker?.detail} onClick={startSimulation}><Play size={14} fill="currentColor" aria-hidden="true" /> Create run</button>
        </>}
      />
      {error && <div className="notice error" role="alert"><strong>Planner action failed.</strong> {error}</div>}
      <ReadinessPanel readiness={readiness} />

      <div className="workspace">
        <aside className="rail" aria-label="Fleet roster">
          <header className="rail-header">
            <div><div className="eyebrow">Fleet roster</div><h2>UAV assignments</h2><p className="rail-description">Select the vehicle that owns the next map waypoint.</p></div>
            <span className="rail-count">{mission.vehicles.length}</span>
          </header>
          <form className="inline-form" onSubmit={handleAddVehicle}>
            <input aria-label="New UAV callsign" aria-describedby="callsign-help" placeholder="UAV-004" value={callsign} onChange={(event) => setCallsign(event.target.value)} />
            <button className="button" type="submit" disabled={busy || !callsign.trim()} title="Add a simulated UAV to this mission"><Plus size={13} aria-hidden="true" /> Add UAV</button>
          </form>
          <p id="callsign-help" className="field-help">Adds a survey-capable simulated vehicle at the default starting position.</p>
          {mission.vehicles.length === 0 ? (
            <div className="list-empty">No UAVs assigned. Add at least one before a run can be created.</div>
          ) : (
            <div className="list">
              {mission.vehicles.map((vehicle) => {
                const waypointCount = mission.waypoints.filter((item) => item.vehicle_id === vehicle.id).length;
                return <button className={`list-item selectable ${selectedVehicle === vehicle.id ? "selected" : ""}`} type="button" key={vehicle.id} onClick={() => setSelectedVehicle(vehicle.id)} aria-pressed={selectedVehicle === vehicle.id}><strong>{vehicle.callsign}</strong><span>{vehicle.vehicle_type} · {waypointCount} route point{waypointCount === 1 ? "" : "s"}</span></button>;
              })}
            </div>
          )}
        </aside>

        <section className="map-stage" aria-label="Interactive mission map">
          <div ref={mapNode} className="map-canvas" data-basemap-ready={basemapReady} />
          <div className="map-legend" aria-label="Map legend"><span className="legend-item"><span className="legend-mark point" /> Route point</span><span className="legend-item"><span className="legend-mark" /> Planned route</span><span className="legend-item">Basemap / context</span></div>
          <div className={`map-hint ${basemapError ? "error" : ""}`}>
            {basemapError ? <><strong>Basemap unavailable</strong><span>Check the map connection before placing a route point.</span></> : <><strong>{selectedVehicleDefinition ? `Add a route point for ${selectedVehicleDefinition.callsign}` : "Select a UAV first"}</strong><span>{selectedVehicleDefinition ? "Click the map. Drag a point to reposition it, then save the waypoint." : "Choose a vehicle in the fleet roster to enable map placement."}</span></>}
          </div>
        </section>

        <aside className="inspector" aria-label="Mission configuration">
          <header className="inspector-header"><div><div className="eyebrow">Configuration</div><h2>Mission settings</h2><p className="inspector-description">The saved definition used to create each run.</p></div></header>
          <section className="inspector-section mission-settings">
            <label className="field">Mission name<input value={name} onChange={(event) => setName(event.target.value)} aria-describedby="mission-name-help" /></label>
            <p id="mission-name-help" className="field-help">Names identify this reusable definition in the mission catalog.</p>
            <div className="metric"><span>Lifecycle</span><strong>{mission.status}</strong></div>
            <div className="metric"><span>Assigned UAVs</span><strong>{mission.vehicles.length}</strong></div>
            <div className="metric"><span>Route points</span><strong>{mission.waypoints.length}</strong></div>
            <div className="settings-actions"><button className="button" type="button" disabled={busy || !nameDirty} onClick={saveMission}><Save size={13} aria-hidden="true" /> Save name</button><span className="save-state">{nameDirty ? "Unsaved name" : "Name saved"}</span></div>
          </section>

          <section className="inspector-section">
            <div className="eyebrow">Route editor</div>
            {selectedWaypoint ? (
              <div className="waypoint-editor">
                <h3>Waypoint {selectedWaypoint.sequence + 1}</h3>
                <p>Drag the map marker for coarse placement or enter exact values below. Save to persist this route point.</p>
                <label className="field">Latitude<input type="number" step="0.000001" value={selectedWaypoint.latitude} onChange={(event) => updateSelectedWaypoint({ latitude: Number(event.target.value) })} /></label>
                <label className="field">Longitude<input type="number" step="0.000001" value={selectedWaypoint.longitude} onChange={(event) => updateSelectedWaypoint({ longitude: Number(event.target.value) })} /></label>
                <label className="field">Altitude (m)<input type="number" min={0} value={selectedWaypoint.altitude_m} onChange={(event) => updateSelectedWaypoint({ altitude_m: Number(event.target.value) })} /></label>
                <label className="field">Target speed (m/s)<input type="number" min={0} value={selectedWaypoint.target_speed_mps ?? ""} onChange={(event) => updateSelectedWaypoint({ target_speed_mps: event.target.value ? Number(event.target.value) : null })} /></label>
                <label className="field">Arrival radius (m)<input type="number" min={0} value={selectedWaypoint.arrival_radius_m ?? ""} onChange={(event) => updateSelectedWaypoint({ arrival_radius_m: event.target.value ? Number(event.target.value) : null })} /></label>
                <label className="field">Action<select value={selectedWaypoint.action} onChange={(event) => updateSelectedWaypoint({ action: event.target.value as Waypoint["action"] })}><option value="TRANSIT">TRANSIT · travel through</option><option value="HOLD">HOLD · remain in place</option><option value="SURVEY">SURVEY · collect simulated data</option><option value="RETURN">RETURN · return to base</option></select></label>
                <div className="waypoint-actions"><button className="button" type="button" disabled={busy || !waypointDirty} onClick={saveWaypoint}><Save size={13} aria-hidden="true" /> Save waypoint</button><button className="button danger" type="button" disabled={busy} onClick={removeSelectedWaypoint} title="Permanently remove this route point from the mission"><Trash2 size={13} aria-hidden="true" /> Delete point</button></div>
                <span className="save-state">{waypointDirty ? "Unsaved route changes" : "Route point saved"}</span>
              </div>
            ) : (
              <div className="empty-state"><MapPin size={17} aria-hidden="true" /><strong>No route point selected.</strong><p>Select a marker on the map to inspect exact coordinates and route behavior.</p></div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
