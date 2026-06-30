import { Brand } from './Brand';
import { Clock } from './Clock';
import { SearchBox } from './SearchBox';
import { Legend } from './Legend';
import { HotList } from './HotList';
import { TimeMachine } from './TimeMachine';
import { InfoPanel } from './InfoPanel';

/** The DOM overlay layer that floats above the 3D scene. */
export function Hud() {
  return (
    <div className="hud">
      <Brand />
      <Clock />
      <SearchBox />
      <div className="leftcol">
        <Legend />
        <HotList />
      </div>
      <TimeMachine />
      <InfoPanel />
      <div className="hint">drag to rotate · scroll to zoom · click an object</div>
    </div>
  );
}
