import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aShow;
  uniform float uSize;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vShow;
  void main() {
    vColor = aColor;
    vShow = aShow;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * uPixelRatio * (7.5 / max(-mv.z, 0.1));
    gl_PointSize = clamp(size, 1.2, 7.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vShow;
  void main() {
    if (vShow < 0.5) discard;
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.05, d);
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Round, additive-free point sprites: per-object colour + show flag. */
export function createSatelliteMaterial(pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 2.4 },
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
}
