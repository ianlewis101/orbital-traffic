import { Canvas } from '@react-three/fiber';
import { useCatalog, useCoastlines } from '../data/queries';
import { useSatelliteField } from './useSatelliteField';
import { SimDriver } from './SimDriver';
import { CameraRig } from './CameraRig';
import { Starfield } from './Starfield';
import { Earth } from './Earth';
import { Satellites } from './Satellites';
import { SelectionMarker } from './SelectionMarker';

/** The full 3D world: globe, starfield, the live satellite field, selection. */
export function Scene() {
  const { data: catalog } = useCatalog();
  const { data: coastlines } = useCoastlines();
  const field = useSatelliteField(catalog);

  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, touchAction: 'none' }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [2.6, 1.7, 2.6], fov: 42, near: 0.05, far: 200 }}
      onCreated={({ gl }) => gl.setClearColor('#05060b')}
    >
      <SimDriver />
      <CameraRig field={field} />
      <ambientLight intensity={0.65} />
      <Starfield />
      <Earth coastlines={coastlines} />
      {field && <Satellites field={field} />}
      {field && <SelectionMarker field={field} />}
    </Canvas>
  );
}
