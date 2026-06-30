import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { SatelliteField } from './SatelliteField';
import { createSatelliteMaterial } from './satelliteMaterial';
import { simClock } from '../lib/simClock';
import { useStore } from '../store/useStore';
import { useHover } from '../store/useHover';

const DRAG_PX = 6; // pointer travel above which a press is a drag, not a click
const HOVER_INTERVAL_MS = 40;

export function Satellites({ field }: { field: SatelliteField }) {
  const { camera, gl } = useThree();
  const material = useMemo(
    () => createSatelliteMaterial(Math.min(window.devicePixelRatio, 2)),
    [],
  );

  useFrame(() => {
    // SimDriver has already advanced the clock for this frame.
    field.update(simClock.date(), useStore.getState().hidden);
  });

  // Pointer handling: click selects, move hovers (throttled). Both run a
  // manual pick so we never rely on raycasting 11k point sprites.
  useEffect(() => {
    const el = gl.domElement;
    let downX = 0;
    let downY = 0;
    let dragging = false;
    let lastHover = 0;

    const ndc = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return {
        x: ((clientX - r.left) / r.width) * 2 - 1,
        y: -((clientY - r.top) / r.height) * 2 + 1,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      dragging = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_PX) dragging = true;
      const now = performance.now();
      if (now - lastHover < HOVER_INTERVAL_MS) return;
      lastHover = now;
      const { x, y } = ndc(e.clientX, e.clientY);
      const id = field.pick(camera, x, y, 0.03);
      if (id) {
        const obj = field.objectAt(id);
        useHover.getState().set({ id, name: obj?.name ?? id, x: e.clientX, y: e.clientY });
        el.style.cursor = 'pointer';
      } else if (useHover.getState().id) {
        useHover.getState().set(null);
        el.style.cursor = '';
      }
    };
    const onClick = (e: PointerEvent) => {
      if (dragging) return;
      const { x, y } = ndc(e.clientX, e.clientY);
      const id = field.pick(camera, x, y, 0.03);
      if (id) useStore.getState().select(id);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('click', onClick);
    };
  }, [field, camera, gl]);

  return <points geometry={field.geometry} material={material} frustumCulled={false} />;
}
