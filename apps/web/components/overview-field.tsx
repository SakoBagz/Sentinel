"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function OverviewField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const host = canvas.parentElement;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.15, 7.2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x111315, 0);

    const system = new THREE.Group();
    system.rotation.set(-0.14, -0.42, 0.08);
    scene.add(system);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 24, 14),
      new THREE.MeshBasicMaterial({ color: 0x8d949b, wireframe: true, transparent: true, opacity: 0.42 }),
    );
    system.add(globe);

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(2.18, 0.012, 6, 128),
      new THREE.MeshBasicMaterial({ color: 0xdfe2e5, transparent: true, opacity: 0.7 }),
    );
    orbit.rotation.set(0.7, 0.12, -0.24);
    system.add(orbit);

    const nodePositions = new Float32Array([
      -1.12, 0.58, 1.24, 0.72, 0.12, 1.49, 0.38, -0.88, 1.35,
      -0.42, -1.22, 0.94, 0.96, 0.9, 0.74, -1.4, -0.32, 0.36,
      1.18, -0.38, -0.9, -0.68, 1.16, -0.42, 0.24, 0.42, -1.54,
    ]);
    const nodes = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(nodePositions, 3)),
      new THREE.PointsMaterial({ color: 0xf1f2f3, size: 0.07, sizeAttenuation: true }),
    );
    system.add(nodes);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    const render = () => {
      renderer.render(scene, camera);
      if (reducedMotion) return;
      system.rotation.y += 0.0018;
      orbit.rotation.z += 0.0022;
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      globe.geometry.dispose();
      globe.material.dispose();
      orbit.geometry.dispose();
      orbit.material.dispose();
      nodes.geometry.dispose();
      nodes.material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <figure className="overview-field" aria-label="Abstract telemetry and mission network visualization">
      <div className="overview-field-fallback" aria-hidden="true">
        <span className="field-orbit orbit-a" />
        <span className="field-orbit orbit-b" />
        <span className="field-orbit orbit-c" />
        <span className="field-core" />
        {Array.from({ length: 12 }, (_, index) => <span className={`field-node node-${index + 1}`} key={index} />)}
      </div>
      <canvas ref={canvasRef} />
      <figcaption className="overview-field-caption">
        <span>System view</span>
        <span>Visual only · no control authority</span>
      </figcaption>
      <div className="overview-field-label" aria-hidden="true">
        <span>25 UAV NETWORK</span>
        <span>DETERMINISTIC / REPLAYABLE</span>
      </div>
    </figure>
  );
}
