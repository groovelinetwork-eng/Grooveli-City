import { useEffect } from 'react';
import type { CityCanvasProps } from '../src/scene/CityCanvas';

/**
 * jsdom has no WebGL: stands in for the R3F canvas so the DOM HUD can be
 * tested. Like the real canvas, it reports each newly shown scene as drawn.
 */
export function CanvasStub(props: Partial<CityCanvasProps>) {
  const scene = props.interior?.kind ?? 'street';
  const { onSceneReady } = props;
  useEffect(() => {
    const t = setTimeout(() => onSceneReady?.(), 0);
    return () => clearTimeout(t);
  }, [scene, onSceneReady]);
  return <div data-testid="canvas-stub" data-scene={scene} />;
}
