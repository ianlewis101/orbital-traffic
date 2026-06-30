import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { CoastlineRing } from '@orbital/data';
import { sunDirection } from '../lib/geo';
import { simClock } from '../lib/simClock';
import { buildDayTexture, buildOceanTexture } from './earthTexture';

const earthVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Samples the day texture by inverting the geoToVec mapping, then blends to a
// dim night side across a soft terminator driven by the Sun direction.
const earthFrag = /* glsl */ `
  uniform sampler2D uDay;
  uniform vec3 uSun;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 n = normalize(vDir);
    float lon = atan(n.z, n.x);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    vec3 day = texture2D(uDay, uv).rgb;
    float ndl = dot(n, normalize(uSun));
    float dayAmt = smoothstep(-0.12, 0.20, ndl);
    vec3 night = day * 0.05 + vec3(0.012, 0.022, 0.05);
    vec3 col = mix(night, day, dayAmt);
    // Cool atmospheric lift right at the terminator.
    float term = 1.0 - smoothstep(0.0, 0.22, abs(ndl));
    col += vec3(0.06, 0.14, 0.24) * term * dayAmt * 0.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const atmoVert = /* glsl */ `
  varying vec3 vDir;
  varying vec3 vView;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const atmoFrag = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vDir;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - max(dot(vDir, vView), 0.0), 2.2);
    float lit = smoothstep(-0.3, 0.5, dot(normalize(vDir), normalize(uSun)));
    vec3 glow = mix(vec3(0.10, 0.22, 0.45), vec3(0.30, 0.55, 0.95), lit);
    gl_FragColor = vec4(glow, rim * (0.35 + 0.5 * lit));
  }
`;

interface EarthProps {
  coastlines?: CoastlineRing[];
}

export function Earth({ coastlines }: EarthProps) {
  const sunRef = useRef(new THREE.Vector3(1, 0, 0));

  const dayTexture = useMemo(
    () => (coastlines && coastlines.length ? buildDayTexture(coastlines) : buildOceanTexture()),
    [coastlines],
  );

  const earthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uDay: { value: dayTexture }, uSun: { value: sunRef.current } },
        vertexShader: earthVert,
        fragmentShader: earthFrag,
      }),
    [dayTexture],
  );

  const atmoMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: sunRef.current } },
        vertexShader: atmoVert,
        fragmentShader: atmoFrag,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(() => {
    sunDirection(simClock.date(), sunRef.current);
  });

  return (
    <group>
      <mesh material={earthMaterial}>
        <sphereGeometry args={[1, 96, 96]} />
      </mesh>
      <mesh material={atmoMaterial} scale={1.03}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
    </group>
  );
}
