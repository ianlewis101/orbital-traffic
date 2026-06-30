import { useMemo } from 'react';
import { neoOrbitPath, neoPositionAt, type NeoElements } from '@orbital/core';

/** A clean heliocentric schematic of a NEO's orbit vs Earth's. */
export function NeoOrbitDiagram({ neo }: { neo: NeoElements }) {
  const { d, sun, earth, asteroid, earthR } = useMemo(() => {
    const path = neoOrbitPath(neo, 160).map((p) => [p.x, p.y] as const);
    const now = neoPositionAt(neo, new Date());
    const maxR = Math.max(1, ...path.map(([x, y]) => Math.hypot(x, y)));
    const S = 86 / maxR;
    const C = 100;
    const toXY = (x: number, y: number) => [C + x * S, C - y * S] as const;
    const d = path.map(([x, y], i) => `${i ? 'L' : 'M'}${toXY(x, y).join(',')}`).join(' ') + 'Z';
    return {
      d,
      sun: [C, C] as const,
      earth: toXY(1, 0),
      asteroid: toXY(now.x, now.y),
      earthR: S,
    };
  }, [neo]);

  return (
    <svg viewBox="0 0 200 200" className="neo-orbit" role="img" aria-label="Orbit diagram">
      <circle cx={sun[0]} cy={sun[1]} r={earthR} fill="none" stroke="rgba(56,189,248,0.35)" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="#ff4422" strokeWidth="1.3" />
      <circle cx={sun[0]} cy={sun[1]} r="3.4" fill="#fbbf24" />
      <circle cx={earth[0]} cy={earth[1]} r="2.6" fill="#38bdf8" />
      <circle cx={asteroid[0]} cy={asteroid[1]} r="3.4" fill="#ff4422" />
    </svg>
  );
}
