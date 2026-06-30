import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SatelliteField } from './SatelliteField';
import { useStore } from '../store/useStore';

/** Orbit camera with damping, plus an animated "centre on object" focus. */
export function CameraRig({ field }: { field: SatelliteField | null }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const focusTarget = useRef<THREE.Vector3 | null>(null);

  const focusNonce = useStore((s) => s.focusNonce);
  const focusId = useStore((s) => s.focusId);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.5;
    c.zoomSpeed = 0.8;
    c.minDistance = 1.25;
    c.maxDistance = 12;
    c.enablePan = false;
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl]);

  useEffect(() => {
    if (!field || focusNonce === 0 || !focusId) return;
    const pos = field.positionOf(focusId);
    if (!pos) return;
    const dist = THREE.MathUtils.clamp(camera.position.length(), 2.2, 4.0);
    // Re-run only when a new focus is requested (focusNonce), not on every
    // camera move; reading focusId/field/camera imperatively is intentional.
    focusTarget.current = pos.clone().normalize().multiplyScalar(dist);
  }, [focusNonce, field, focusId, camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    if (focusTarget.current) {
      camera.position.lerp(focusTarget.current, 0.12);
      if (camera.position.distanceTo(focusTarget.current) < 0.01) focusTarget.current = null;
    }
    c.update();
  });

  return null;
}
