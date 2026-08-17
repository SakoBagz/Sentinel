"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

export function OverviewField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const host = canvas.parentElement;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.12, 7.4);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    host.dataset.rendered = "true";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x111315, 0);

    scene.add(new THREE.AmbientLight(0xe8ebee, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9ca3aa, 1.8);
    rimLight.position.set(4, -1, -4);
    scene.add(rimLight);

    const system = new THREE.Group();
    system.rotation.set(-0.22, -0.68, 0.08);
    scene.add(system);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb5bbc1, metalness: 0.45, roughness: 0.48 });
    const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x6f767e, metalness: 0.55, roughness: 0.42 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: 0.2, roughness: 0.38 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x343a41, metalness: 0.7, roughness: 0.35 });

    const uav = new THREE.Group();
    uav.scale.setScalar(1.05);
    uav.rotation.set(0.12, 0.12, -0.04);
    system.add(uav);

    const fuselage = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bodyMaterial);
    fuselage.scale.set(0.3, 0.19, 1.3);
    fuselage.position.z = 0.05;
    uav.add(fuselage);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.56, 18), accentMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.28;
    uav.add(nose);

    // A tapered, high-aspect-ratio wing gives the aircraft its long-endurance silhouette.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.42);
    wingShape.lineTo(2.18, 0.12);
    wingShape.lineTo(2.04, 0.34);
    wingShape.lineTo(0, 0.08);
    wingShape.closePath();
    const wingGeometry = new THREE.ExtrudeGeometry(wingShape, {
      bevelEnabled: false,
      depth: 0.07,
    });
    wingGeometry.rotateX(Math.PI / 2);

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.y = -0.035;
    const leftWing = rightWing.clone();
    leftWing.scale.x = -1;
    uav.add(rightWing, leftWing);

    const wingletGeometry = new THREE.BoxGeometry(0.12, 0.28, 0.18);
    const rightWinglet = new THREE.Mesh(wingletGeometry, darkMaterial);
    rightWinglet.position.set(2.05, 0.12, 0.26);
    rightWinglet.rotation.z = -0.12;
    const leftWinglet = rightWinglet.clone();
    leftWinglet.position.x = -2.05;
    leftWinglet.rotation.z = 0.12;
    uav.add(rightWinglet, leftWinglet);

    // The split tail is intentionally modeled as a V-tail rather than a conventional fin.
    const tailplaneGeometry = new THREE.BoxGeometry(0.84, 0.055, 0.2);
    const rightTailplane = new THREE.Mesh(tailplaneGeometry, wingMaterial);
    rightTailplane.position.set(0.32, 0.14, 0.98);
    rightTailplane.rotation.z = -0.34;
    const leftTailplane = rightTailplane.clone();
    leftTailplane.position.x = -0.32;
    leftTailplane.rotation.z = 0.34;
    uav.add(rightTailplane, leftTailplane);

    const sensorPod = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), accentMaterial);
    sensorPod.scale.set(0.9, 0.7, 1.25);
    sensorPod.position.set(0, -0.18, -0.34);
    uav.add(sensorPod);

    const engineFairing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.42, 16), darkMaterial);
    engineFairing.rotation.x = Math.PI / 2;
    engineFairing.position.z = 1.17;
    uav.add(engineFairing);

    const propeller = new THREE.Group();
    propeller.position.z = 1.42;
    const propellerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.13, 12), darkMaterial);
    propellerHub.rotation.x = Math.PI / 2;
    propeller.add(propellerHub);
    const propellerBlade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.74, 0.025), accentMaterial);
    propeller.add(propellerBlade);
    const propellerBladeCross = propellerBlade.clone();
    propellerBladeCross.rotation.z = Math.PI / 2;
    propeller.add(propellerBladeCross);
    uav.add(propeller);

    const envelope = new THREE.Group();
    const envelopeMaterial = new THREE.MeshBasicMaterial({ color: 0xdfe2e5, transparent: true, opacity: 0.42 });
    const envelopeRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.012, 6, 128), envelopeMaterial);
    envelopeRing.rotation.set(0.72, 0.14, -0.26);
    envelope.add(envelopeRing);
    const envelopeRingCross = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.008, 6, 128), envelopeMaterial);
    envelopeRingCross.rotation.set(-0.48, 0.3, 0.54);
    envelope.add(envelopeRingCross);
    system.add(envelope);

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
      envelope.rotation.z += 0.0016;
      propeller.rotation.z += 0.12;
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      delete host.dataset.rendered;
      disposeObject(system);
      disposeObject(envelope);
      renderer.dispose();
    };
  }, []);

  return (
    <figure className="overview-field" aria-label="Rotating long-endurance fixed-wing UAV model and simulated flight envelope">
      <div className="overview-field-fallback" aria-hidden="true">
        <span className="field-orbit orbit-a" />
        <span className="field-orbit orbit-b" />
        <span className="fallback-uav">
          <span className="fallback-uav-nose" />
          <span className="fallback-uav-body" />
          <span className="fallback-uav-wing fallback-uav-wing-left" />
          <span className="fallback-uav-wing fallback-uav-wing-right" />
          <span className="fallback-uav-tail fallback-uav-tail-left" />
          <span className="fallback-uav-tail fallback-uav-tail-right" />
          <span className="fallback-uav-propeller" />
        </span>
      </div>
      <canvas ref={canvasRef} />
      <figcaption className="overview-field-caption">
        <span>Long-endurance UAV</span>
        <span>Visual only · no control authority</span>
      </figcaption>
      <div className="overview-field-label" aria-hidden="true">
        <span>FIXED-WING UAV</span>
        <span>DETERMINISTIC / REPLAYABLE</span>
      </div>
    </figure>
  );
}
