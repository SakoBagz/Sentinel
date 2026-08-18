"use client";

import { useEffect, useRef, useState } from "react";

const MODEL_PAGE_URL = "https://sketchfab.com/3d-models/mq-9-reaper-eff549610fee4f20904f7b388a3a0830";
const MODEL_UID = "eff549610fee4f20904f7b388a3a0830";
const VIEWER_API_URL = "https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js";

type SketchfabNode = {
  instanceID?: number;
  name?: string;
};

type SketchfabCamera = {
  position: number[];
  target: number[];
};

type SketchfabViewerApi = {
  addEventListener: (event: string, callback: () => void) => void;
  focusOnVisibleGeometries: (callback?: (error?: unknown) => void) => void;
  getCameraLookAt: (callback: (error: unknown, camera: SketchfabCamera) => void) => void;
  getNodeMap: (callback: (error: unknown, nodes: SketchfabNode[]) => void) => void;
  hide: (instanceId: number, callback?: (error?: unknown) => void) => void;
  setBackground: (options: { color: [number, number, number] }, callback?: (error?: unknown) => void) => void;
  setCameraLookAt: (position: number[], target: number[], duration: number, callback?: (error?: unknown) => void) => void;
  setCameraEasing: (easing: string) => void;
  setFov: (angle: number, callback?: (error?: unknown) => void) => void;
  start: (callback?: () => void) => void;
};

type SketchfabInitOptions = {
  annotation: number;
  autostart: number;
  autospin: number;
  camera: number;
  dnt: number;
  preload: number;
  transparent: number;
  ui_annotations: number;
  ui_controls: number;
  ui_help: number;
  ui_hint: number;
  ui_infos: number;
  ui_inspector: number;
  ui_settings: number;
  ui_stop: number;
  ui_theme: "dark";
  ui_vr: number;
  success: (api: SketchfabViewerApi) => void;
  error: () => void;
};

type SketchfabClient = {
  init: (uid: string, options: SketchfabInitOptions) => void;
};

type SketchfabConstructor = new (version: string, iframe: HTMLIFrameElement) => SketchfabClient;

declare global {
  interface Window {
    Sketchfab?: SketchfabConstructor;
  }
}

const ORDNANCE_NODE_PATTERN = /bomb|hellfire|missile|munition|ordnance|paveway|rocket|weapon/i;

function initializeViewer(
  iframe: HTMLIFrameElement,
  prefersReducedMotion: boolean,
  onReady: () => void,
  onError: () => void,
) {
  if (!window.Sketchfab) {
    onError();
    return;
  }

  const client = new window.Sketchfab("1.12.1", iframe);
  client.init(MODEL_UID, {
    annotation: 0,
    autostart: 1,
    autospin: prefersReducedMotion ? 0 : 0.2,
    camera: 0,
    dnt: 1,
    preload: 1,
    transparent: 0,
    ui_annotations: 0,
    ui_controls: 0,
    ui_help: 0,
    ui_hint: 2,
    ui_infos: 0,
    ui_inspector: 0,
    ui_settings: 0,
    ui_stop: 0,
    ui_theme: "dark",
    ui_vr: 0,
    success: (api) => {
      api.addEventListener("viewerready", () => {
        api.setBackground({ color: [0.067, 0.075, 0.082] });
        api.setCameraEasing("easeOutCubic");
        api.setFov(42);

        const focusModel = () => {
          api.focusOnVisibleGeometries(() => {
            api.getCameraLookAt((error, camera) => {
              if (error || camera.position.length !== 3 || camera.target.length !== 3) {
                onReady();
                return;
              }

              const [x, y, z] = camera.position;
              const [targetX, targetY, targetZ] = camera.target;
              const radius = Math.max(Math.hypot(x - targetX, y - targetY, z - targetZ), 1);
              const elevatedPosition = [
                targetX + radius * 0.72,
                targetY + radius * 0.58,
                targetZ + radius * 0.72,
              ];
              api.setCameraLookAt(elevatedPosition, camera.target, 1.1, () => onReady());
            });
          });
        };

        api.getNodeMap((error, nodes) => {
          if (error || !Array.isArray(nodes)) {
            focusModel();
            return;
          }

          const restrictedNodes = nodes.filter(
            (node): node is SketchfabNode & { instanceID: number } =>
              typeof node.instanceID === "number" && ORDNANCE_NODE_PATTERN.test(node.name ?? ""),
          );

          if (restrictedNodes.length === 0) {
            focusModel();
            return;
          }

          let remaining = restrictedNodes.length;
          const onNodeHidden = () => {
            remaining -= 1;
            if (remaining === 0) focusModel();
          };

          restrictedNodes.forEach((node) => api.hide(node.instanceID, onNodeHidden));
        });
      });
      api.start();
    },
    error: onError,
  });
}

export function OverviewField() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const startViewer = () => {
      if (cancelled) return;
      initializeViewer(iframe, motionQuery.matches, () => setIsLoaded(true), () => setIsLoaded(false));
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${VIEWER_API_URL}"]`);
    if (window.Sketchfab) {
      startViewer();
    } else if (existingScript) {
      existingScript.addEventListener("load", startViewer, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = VIEWER_API_URL;
      script.async = true;
      script.addEventListener("load", startViewer, { once: true });
      script.setAttribute("data-sentinel-sketchfab-api", "true");
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existingScript?.removeEventListener("load", startViewer);
    };
  }, []);

  return (
    <figure className="overview-field" aria-label="Rotating MQ-9 Reaper UAV model and simulated flight envelope">
      <div className={`overview-field-stage${isLoaded ? " is-loaded" : ""}`}>
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
        <iframe
          ref={iframeRef}
          className="overview-field-embed"
          title="Interactive MQ-9 Reaper UAV model by Tyler V. Howell on Sketchfab"
          loading="eager"
          allow="autoplay; fullscreen; xr-spatial-tracking"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <figcaption className="overview-field-caption">
        <span>MQ-9 Reaper airframe</span>
        <a href={MODEL_PAGE_URL} target="_blank" rel="noreferrer">
          Model by Tyler V. Howell / Sketchfab · CC BY
        </a>
      </figcaption>
      <div className="overview-field-label" aria-hidden="true">
        <span>REFERENCE AIRFRAME</span>
        <span>SIMULATION VISUAL ONLY</span>
      </div>
    </figure>
  );
}
