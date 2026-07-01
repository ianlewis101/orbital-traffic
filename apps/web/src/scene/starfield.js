import * as THREE from "three";
import { scene } from "./core.js";

export function initStarfield() {
  const N = 2200,
    pos = new Float32Array(N * 3),
    col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1,
      t = Math.random() * Math.PI * 2,
      s = Math.sqrt(1 - u * u),
      R = 600 + Math.random() * 900;
    pos[i * 3] = R * s * Math.cos(t);
    pos[i * 3 + 1] = R * u;
    pos[i * 3 + 2] = R * s * Math.sin(t);
    const b = 0.5 + Math.random() * 0.5,
      w = Math.random() < 0.1 ? 0.7 : 1;
    col[i * 3] = b;
    col[i * 3 + 1] = b * 0.96;
    col[i * 3 + 2] = b * (0.86 + 0.14 * w);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  scene.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 1.4,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
      })
    )
  );
}
