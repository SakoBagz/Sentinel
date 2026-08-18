"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type FuselageStation = {
  z: number;
  radiusX: number;
  radiusY: number;
  centerY?: number;
};

type PlanformPoint = readonly [number, number];

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function createFuselageGeometry() {
  const stations: FuselageStation[] = [
    { z: -1.54, radiusX: 0.012, radiusY: 0.012, centerY: 0.01 },
    { z: -1.42, radiusX: 0.095, radiusY: 0.075, centerY: 0.01 },
    { z: -1.16, radiusX: 0.17, radiusY: 0.13, centerY: 0.01 },
    { z: -0.72, radiusX: 0.235, radiusY: 0.18, centerY: 0.01 },
    { z: -0.05, radiusX: 0.255, radiusY: 0.205, centerY: 0.01 },
    { z: 0.57, radiusX: 0.22, radiusY: 0.18, centerY: 0.02 },
    { z: 1.02, radiusX: 0.145, radiusY: 0.12, centerY: 0.04 },
    { z: 1.31, radiusX: 0.075, radiusY: 0.065, centerY: 0.06 },
    { z: 1.43, radiusX: 0.035, radiusY: 0.035, centerY: 0.06 },
  ];
  const radialSegments = 32;
  const positions: number[] = [];
  const indices: number[] = [];

  stations.forEach((station) => {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * station.radiusX,
        (station.centerY ?? 0) + Math.sin(angle) * station.radiusY,
        station.z,
      );
    }
  });

  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex += 1) {
    const currentRing = stationIndex * radialSegments;
    const nextRing = (stationIndex + 1) * radialSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const nextSegment = (segment + 1) % radialSegments;
      const current = currentRing + segment;
      const currentNext = currentRing + nextSegment;
      const next = nextRing + segment;
      const nextNext = nextRing + nextSegment;
      indices.push(current, currentNext, next, currentNext, nextNext, next);
    }
  }

  const noseCenter = positions.length / 3;
  const noseStation = stations[0];
  positions.push(0, noseStation.centerY ?? 0, noseStation.z);
  const tailCenter = positions.length / 3;
  const tailStation = stations[stations.length - 1];
  positions.push(0, tailStation.centerY ?? 0, tailStation.z);

  for (let segment = 0; segment < radialSegments; segment += 1) {
    const nextSegment = (segment + 1) % radialSegments;
    indices.push(noseCenter, nextSegment, segment);

    const tailRing = (stations.length - 1) * radialSegments;
    indices.push(tailCenter, tailRing + segment, tailRing + nextSegment);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPrismGeometry(points: readonly PlanformPoint[], bottom: number, top: number) {
  const positions: number[] = [];
  const indices: number[] = [];

  points.forEach(([x, z]) => positions.push(x, top, z));
  points.forEach(([x, z]) => positions.push(x, bottom, z));

  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(points.length, points.length + index, points.length + index + 1);
  }

  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    indices.push(index, next, points.length + index);
    indices.push(next, points.length + next, points.length + index);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mirrorPlanform(points: readonly PlanformPoint[]) {
  return [...points].reverse().map(([x, z]) => [-x, z] as const);
}

function createPropellerBladeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.035, 0.08);
  shape.quadraticCurveTo(0.13, 0.16, 0.12, 0.34);
  shape.quadraticCurveTo(0.11, 0.52, 0.025, 0.67);
  shape.lineTo(-0.055, 0.61);
  shape.quadraticCurveTo(-0.02, 0.43, -0.075, 0.26);
  shape.quadraticCurveTo(-0.1, 0.14, -0.035, 0.08);

  return new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    depth: 0.035,
    curveSegments: 3,
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
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.16, 7.35);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }

    host.dataset.rendered = "true";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x111315, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const hemisphereLight = new THREE.HemisphereLight(0xe9edf0, 0x16191d, 1.9);
    scene.add(hemisphereLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
    keyLight.position.set(-3.5, 4.5, 5.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaab2ba, 1.7);
    fillLight.position.set(4, 0.8, 1.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xd3d8dd, 2.2);
    rimLight.position.set(2, 1.5, -5);
    scene.add(rimLight);

    const system = new THREE.Group();
    system.rotation.set(-0.22, -0.68, 0.08);
    scene.add(system);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xb5bbc1,
      metalness: 0.48,
      roughness: 0.34,
    });
    const upperBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xd3d7da,
      metalness: 0.32,
      roughness: 0.3,
    });
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: 0x9aa2aa,
      metalness: 0.42,
      roughness: 0.42,
      emissive: 0x20262b,
      emissiveIntensity: 0.16,
      side: THREE.DoubleSide,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x737c84,
      metalness: 0.54,
      roughness: 0.34,
      emissive: 0x1a2025,
      emissiveIntensity: 0.14,
      side: THREE.DoubleSide,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8ebee,
      metalness: 0.2,
      roughness: 0.3,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x303840,
      metalness: 0.72,
      roughness: 0.28,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x151b21,
      metalness: 0.35,
      roughness: 0.08,
    });

    const uav = new THREE.Group();
    uav.scale.setScalar(1.04);
    uav.rotation.set(0.12, 0.12, -0.04);
    system.add(uav);

    const fuselage = new THREE.Mesh(createFuselageGeometry(), bodyMaterial);
    uav.add(fuselage);

    const dorsalFairing = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), upperBodyMaterial);
    dorsalFairing.scale.set(0.14, 0.075, 0.36);
    dorsalFairing.position.set(0, 0.19, -0.29);
    uav.add(dorsalFairing);

    const canopyBand = new THREE.Mesh(new THREE.TorusGeometry(0.137, 0.009, 6, 24), edgeMaterial);
    canopyBand.rotation.x = Math.PI / 2;
    canopyBand.scale.set(1, 1, 1.85);
    canopyBand.position.set(0, 0.205, -0.3);
    uav.add(canopyBand);

    const nosePanelRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.009, 6, 24), edgeMaterial);
    nosePanelRing.position.set(0, 0.015, -1.19);
    uav.add(nosePanelRing);

    const wingPoints: PlanformPoint[] = [
      [0.14, -0.51],
      [0.94, -0.43],
      [2.36, -0.08],
      [2.34, 0.14],
      [0.94, 0.25],
      [0.14, 0.4],
    ];
    const rightWing = new THREE.Mesh(createPrismGeometry(wingPoints, -0.02, 0.055), wingMaterial);
    rightWing.position.y = 0.02;
    rightWing.rotation.z = 0.035;
    const leftWing = new THREE.Mesh(createPrismGeometry(mirrorPlanform(wingPoints), -0.02, 0.055), wingMaterial);
    leftWing.rotation.z = -0.035;
    uav.add(rightWing, leftWing);

    const rightAileron = new THREE.Mesh(
      createPrismGeometry(
        [
          [1.02, 0.115],
          [2.32, 0.105],
          [2.32, 0.145],
          [1.02, 0.205],
        ],
        0.058,
        0.07,
      ),
      edgeMaterial,
    );
    rightAileron.position.y = 0.02;
    const leftAileron = new THREE.Mesh(
      createPrismGeometry(
        mirrorPlanform([
          [1.02, 0.115],
          [2.32, 0.105],
          [2.32, 0.145],
          [1.02, 0.205],
        ]),
        0.058,
        0.07,
      ),
      edgeMaterial,
    );
    leftAileron.position.y = 0.02;
    uav.add(rightAileron, leftAileron);

    const wingletGeometry = new THREE.BoxGeometry(0.075, 0.3, 0.2);
    const rightWinglet = new THREE.Mesh(wingletGeometry, edgeMaterial);
    rightWinglet.position.set(2.34, 0.18, 0.04);
    rightWinglet.rotation.z = 0.1;
    const leftWinglet = rightWinglet.clone();
    leftWinglet.position.x = -2.34;
    leftWinglet.rotation.z = -0.1;
    uav.add(rightWinglet, leftWinglet);

    const wingRootFairingGeometry = new THREE.BoxGeometry(0.18, 0.075, 0.76);
    const rightWingRootFairing = new THREE.Mesh(wingRootFairingGeometry, darkMaterial);
    rightWingRootFairing.position.set(0.105, -0.01, -0.02);
    const leftWingRootFairing = rightWingRootFairing.clone();
    leftWingRootFairing.position.x = -0.105;
    uav.add(rightWingRootFairing, leftWingRootFairing);

    const rightTailplane = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.055, 0.24), wingMaterial);
    rightTailplane.position.set(0.34, 0.25, 1.05);
    rightTailplane.rotation.z = 0.52;
    const leftTailplane = rightTailplane.clone();
    leftTailplane.position.x = -0.34;
    leftTailplane.rotation.z = -0.52;
    uav.add(rightTailplane, leftTailplane);

    const tailControlSurfaceGeometry = new THREE.BoxGeometry(0.42, 0.065, 0.04);
    const rightTailControlSurface = new THREE.Mesh(tailControlSurfaceGeometry, edgeMaterial);
    rightTailControlSurface.position.set(0.48, 0.34, 1.045);
    rightTailControlSurface.rotation.z = 0.52;
    const leftTailControlSurface = rightTailControlSurface.clone();
    leftTailControlSurface.position.x = -0.48;
    leftTailControlSurface.rotation.z = -0.52;
    uav.add(rightTailControlSurface, leftTailControlSurface);

    const tailSpine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.19, 0.3), darkMaterial);
    tailSpine.position.set(0, 0.13, 1.05);
    tailSpine.rotation.x = -0.12;
    uav.add(tailSpine);

    const sensorAssembly = new THREE.Group();
    sensorAssembly.position.set(0, -0.18, -0.94);
    const sensorMount = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, 0.1, 20), darkMaterial);
    sensorAssembly.add(sensorMount);

    const sensorPod = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), upperBodyMaterial);
    sensorPod.scale.set(0.16, 0.125, 0.19);
    sensorPod.position.set(0, -0.11, -0.045);
    sensorAssembly.add(sensorPod);

    const sensorLens = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), glassMaterial);
    sensorLens.scale.set(0.065, 0.065, 0.026);
    sensorLens.position.set(0, -0.11, -0.21);
    sensorAssembly.add(sensorLens);
    uav.add(sensorAssembly);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.18, 8), darkMaterial);
    antenna.position.set(0, 0.27, 0.42);
    antenna.rotation.z = 0.06;
    uav.add(antenna);

    const antennaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), edgeMaterial);
    antennaBase.position.set(0, 0.22, 0.42);
    uav.add(antennaBase);

    const engineFairing = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.105, 0.38, 24), darkMaterial);
    engineFairing.rotation.x = Math.PI / 2;
    engineFairing.position.z = 1.2;
    uav.add(engineFairing);

    const engineSpinner = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.17, 18), accentMaterial);
    engineSpinner.rotation.x = Math.PI / 2;
    engineSpinner.position.z = 1.42;
    uav.add(engineSpinner);

    const propeller = new THREE.Group();
    propeller.position.z = 1.5;
    const propellerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.13, 16), darkMaterial);
    propellerHub.rotation.x = Math.PI / 2;
    propeller.add(propellerHub);

    const propellerBladeGeometry = createPropellerBladeGeometry();
    const propellerBlade = new THREE.Mesh(propellerBladeGeometry, edgeMaterial);
    propellerBlade.position.z = -0.018;
    propeller.add(propellerBlade);
    for (let bladeIndex = 1; bladeIndex < 3; bladeIndex += 1) {
      const blade = propellerBlade.clone();
      blade.rotation.z = (bladeIndex / 3) * Math.PI * 2;
      propeller.add(blade);
    }
    uav.add(propeller);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const aircraftShadow = new THREE.Mesh(new THREE.CircleGeometry(1.55, 64), shadowMaterial);
    aircraftShadow.scale.set(1.35, 0.34, 1);
    aircraftShadow.rotation.x = -Math.PI / 2;
    aircraftShadow.position.y = -0.62;
    system.add(aircraftShadow);

    const envelope = new THREE.Group();
    const envelopeMaterial = new THREE.MeshBasicMaterial({ color: 0xdfe2e5, transparent: true, opacity: 0.34 });
    const envelopeRing = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.012, 6, 128), envelopeMaterial);
    envelopeRing.rotation.set(0.72, 0.14, -0.26);
    envelope.add(envelopeRing);
    const envelopeRingCross = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.008, 6, 128), envelopeMaterial);
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
    const timer = new THREE.Timer();
    let animationFrame = 0;
    const render = () => {
      timer.update();
      const elapsed = timer.getElapsed();
      if (!reducedMotion) {
        system.rotation.y += 0.0016;
        envelope.rotation.z += 0.0014;
        uav.position.y = Math.sin(elapsed * 0.7) * 0.035;
        uav.rotation.x = 0.12 + Math.sin(elapsed * 0.52) * 0.018;
        uav.rotation.z = -0.04 + Math.sin(elapsed * 0.62) * 0.028;
        sensorAssembly.rotation.y = Math.sin(elapsed * 0.58) * 0.06;
        propeller.rotation.z = elapsed * 18;
      }
      renderer.render(scene, camera);
      if (reducedMotion) return;
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      delete host.dataset.rendered;
      disposeObject(system);
      disposeObject(envelope);
      timer.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <figure className="overview-field" aria-label="Rotating reconnaissance fixed-wing UAV model and simulated flight envelope">
      <div className="overview-field-fallback" aria-hidden="true">
        <span className="field-orbit orbit-a" />
        <span className="field-orbit orbit-b" />
        <span className="fallback-uav">
          <span className="fallback-uav-nose" />
          <span className="fallback-uav-body" />
          <span className="fallback-uav-canopy" />
          <span className="fallback-uav-sensor" />
          <span className="fallback-uav-wing fallback-uav-wing-left" />
          <span className="fallback-uav-wing fallback-uav-wing-right" />
          <span className="fallback-uav-winglet fallback-uav-winglet-left" />
          <span className="fallback-uav-winglet fallback-uav-winglet-right" />
          <span className="fallback-uav-tail fallback-uav-tail-left" />
          <span className="fallback-uav-tail fallback-uav-tail-right" />
          <span className="fallback-uav-propeller" />
        </span>
      </div>
      <canvas ref={canvasRef} />
      <figcaption className="overview-field-caption">
        <span>Reconnaissance UAV</span>
        <span>Visual only · no control authority</span>
      </figcaption>
      <div className="overview-field-label" aria-hidden="true">
        <span>FIXED-WING UAV</span>
        <span>DETERMINISTIC / REPLAYABLE</span>
      </div>
    </figure>
  );
}
