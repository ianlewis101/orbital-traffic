import { Scene } from './scene/Scene';
import { Hud } from './hud/Hud';
import { Tooltip } from './hud/Tooltip';
import { Splash } from './hud/Splash';
import { useCatalog } from './data/queries';

export function App() {
  const { data: catalog, isError } = useCatalog();
  const ready = !!catalog;

  return (
    <>
      <Scene />
      <Hud />
      <Tooltip />
      <Splash
        gone={ready}
        message={isError ? 'Could not load catalog — check connection' : 'Acquiring orbital elements'}
      />
    </>
  );
}
