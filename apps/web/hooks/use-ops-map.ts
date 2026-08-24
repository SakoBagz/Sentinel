import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap, MapOptions } from "maplibre-gl";

import { createOpsMap, runWhenStyleReady } from "@/lib/ops-map";

type UseOpsMapOptions = {
  enabled?: boolean;
  mapOptions?: Partial<Omit<MapOptions, "container">>;
  onReady?: (map: MapLibreMap) => void;
};

/** Mount a MapLibre ops map once and keep canvas size in sync with layout changes. */
export function useOpsMap(
  containerRef: RefObject<HTMLElement | null>,
  { enabled = true, mapOptions, onReady }: UseOpsMapOptions = {},
) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const onReadyRef = useRef(onReady);
  const mapOptionsRef = useRef(mapOptions);
  onReadyRef.current = onReady;
  mapOptionsRef.current = mapOptions;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = createOpsMap(container, mapOptionsRef.current);
    mapRef.current = map;
    setReady(true);
    onReadyRef.current?.(map);

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [containerRef, enabled]);

  return { mapRef, ready };
}

/** Run a map mutation after the basemap style is loaded; re-run when deps change. */
export function useSyncWhenStyleReady(
  mapRef: RefObject<MapLibreMap | null>,
  sync: (map: MapLibreMap) => void,
  deps: readonly unknown[],
) {
  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return runWhenStyleReady(map, () => syncRef.current(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns sync inputs via deps
  }, [mapRef, ...deps]);
}
