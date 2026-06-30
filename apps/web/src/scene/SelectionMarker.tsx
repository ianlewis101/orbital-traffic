import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { SatelliteField } from './SatelliteField';
import { useStore } from '../store/useStore';

/** A pulsing reticle that tracks the selected object on the globe. */
export function SelectionMarker({ field }: { field: SatelliteField }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const selectedId = useStore((s) => s.selectedId);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const pos = selectedId ? field.positionOf(selectedId) : null;
    if (!pos) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.copy(pos);
    g.quaternion.copy(camera.quaternion); // billboard toward the camera
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.12;
    g.scale.setScalar(0.05 * pulse);
  });

  return (
    <group ref={group} visible={false}>
      <mesh>
        <ringGeometry args={[0.7, 1, 40]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <ringGeometry args={[1.25, 1.4, 40]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
