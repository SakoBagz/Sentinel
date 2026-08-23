"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type VehicleInspectFieldProps = {
  headingDeg: number;
  batteryPercent: number;
  communicationsState: string;
  callsign: string;
};

type VisualState = Omit<VehicleInspectFieldProps, "callsign">;

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

export function VehicleInspectField({
  headingDeg,
  batteryPercent,
  communicationsState,
  callsign,
}: VehicleInspectFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<VisualState>({ headingDeg, batteryPercent, communicationsState });
  const renderNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = { headingDeg, batteryPercent, communicationsState };
    renderNowRef.current?.();
  }, [headingDeg, batteryPercent, communicationsState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(4.2, 2.8, 5.8);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }

    host.dataset.rendered = "true";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0e1012, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    scene.add(new THREE.HemisphereLight(0xeef1f4, 0x14171c, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(-3.2, 5.2, 4.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9aa3ad, 1.15);
    fill.position.set(3.4, 1.2, 2.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd7dde3, 2.3);
    rim.position.set(4.2, 1.4, -4.2);
    scene.add(rim);

    const aircraft = new THREE.Group();
    aircraft.rotation.x = -0.08;
    scene.add(aircraft);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xbfc4c9, metalness: 0.48, roughness: 0.34 });
    const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x8e969e, metalness: 0.4, roughness: 0.42 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x343b42, metalness: 0.62, roughness: 0.28 });
    const communicationsMaterial = new THREE.MeshBasicMaterial({ color: 0xe5e8eb, transparent: true, opacity: 0.48 });
    const batteryMaterial = new THREE.MeshBasicMaterial({ color: 0xe5e8eb });

    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.85, 10, 24), bodyMaterial);
    fuselage.rotation.x = Math.PI / 2;
    aircraft.add(fuselage);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.52, 24), bodyMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.38;
    aircraft.add(nose);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 0.72), wingMaterial);
    wings.position.z = -0.12;
    aircraft.add(wings);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.07, 0.38), wingMaterial);
    tail.position.z = 1.1;
    aircraft.add(tail);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.45), edgeMaterial);
    fin.position.set(0, 0.27, 1.08);
    aircraft.add(fin);

    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), edgeMaterial);
    sensor.position.set(0, -0.24, -0.78);
    aircraft.add(sensor);

    const communicationsRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.018, 6, 96), communicationsMaterial);
    communicationsRing.rotation.x = Math.PI / 2;
    communicationsRing.position.y = -0.35;
    scene.add(communicationsRing);

    const batteryTrack = new THREE.Mesh(
      new THREE.BoxGeometry(1.42, 0.06, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x343a40 }),
    );
    batteryTrack.position.set(0, -0.78, 0.7);
    scene.add(batteryTrack);
    const batteryBar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.075, 0.09), batteryMaterial);
    batteryBar.position.set(0, -0.78, 0.69);
    scene.add(batteryBar);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    let animationFrame = 0;

    const applyState = (immediate = false) => {
      const state = stateRef.current;
      const targetHeading = THREE.MathUtils.degToRad(Number.isFinite(state.headingDeg) ? state.headingDeg : 0);
      const delta = Math.atan2(Math.sin(targetHeading - aircraft.rotation.y), Math.cos(targetHeading - aircraft.rotation.y));
      aircraft.rotation.y += immediate ? delta : delta * 0.09;

      const battery = THREE.MathUtils.clamp(state.batteryPercent / 100, 0.02, 1);
      batteryBar.scale.x = battery;
      batteryBar.position.x = (battery - 1) * 0.68;
      batteryMaterial.color.setHex(battery < 0.2 ? 0x747b82 : 0xe5e8eb);

      const communicationsHealthy = /healthy|available|connected|live/i.test(state.communicationsState);
      communicationsMaterial.opacity = communicationsHealthy ? 0.5 : 0.16;
      communicationsMaterial.color.setHex(communicationsHealthy ? 0xe5e8eb : 0x727980);
    };

    const renderOnce = () => {
      applyState(reducedMotion);
      renderer.render(scene, camera);
    };
    renderNowRef.current = renderOnce;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderOnce();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const animate = () => {
      applyState();
      const elapsed = clock.getElapsedTime();
      aircraft.position.y = Math.sin(elapsed * 0.8) * 0.035;
      communicationsRing.rotation.z = elapsed * 0.07;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    if (!reducedMotion) animate();

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      delete host.dataset.rendered;
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      renderNowRef.current = null;
      delete host.dataset.rendered;
      disposeScene(scene);
      renderer.dispose();
    };
  }, []);

  const safeBattery = Number.isFinite(batteryPercent) ? Math.min(100, Math.max(0, batteryPercent)) : 0;
  const safeHeading = Number.isFinite(headingDeg) ? ((headingDeg % 360) + 360) % 360 : 0;

  return (
    <figure
      className="vehicle-inspect-field"
      aria-label={`${callsign} simulated airframe visualization, heading ${safeHeading.toFixed(0)} degrees, battery ${safeBattery.toFixed(0)} percent, communications ${communicationsState}`}
    >
      <div className="vehicle-inspect-fallback" aria-hidden="true">
        <span className="inspect-fallback-fuselage" />
        <span className="inspect-fallback-wings" />
        <span className="inspect-fallback-tail" />
        <span className="inspect-fallback-ring" />
      </div>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="vehicle-inspect-readout" aria-hidden="true">
        <strong>{callsign}</strong>
        <span>HDG {safeHeading.toFixed(0).padStart(3, "0")}°</span>
        <span>BAT {safeBattery.toFixed(0)}%</span>
        <span>COMMS {communicationsState}</span>
      </div>
      <figcaption>Visualization of simulated state · no control authority</figcaption>
    </figure>
  );
}
