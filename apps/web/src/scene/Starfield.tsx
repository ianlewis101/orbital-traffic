import { useMemo } from 'react';
import * as THREE from 'three';

/** A static sphere of stars far behind the scene. */
export function Starfield({ count = 2400 }: { count?: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Uniform points on a large sphere.
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 90 + Math.random() * 60;
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      const b = 0.55 + Math.random() * 0.45;
      const warm = Math.random() < 0.12;
      colors[i * 3] = b;
      colors[i * 3 + 1] = b * 0.96;
      colors[i * 3 + 2] = b * (warm ? 0.82 : 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.7,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    [],
  );

  return <points geometry={geometry} material={material} />;
}
