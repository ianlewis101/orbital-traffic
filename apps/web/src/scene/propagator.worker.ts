/// <reference lib="webworker" />
/**
 * Propagation worker. Owns one Propagator per catalogued object and, on each
 * `tick`, computes every object's scene position with SGP4 — entirely off the
 * main thread. It posts back a freshly-allocated, transferable Float32Array
 * (zero-copy) so the render loop never blocks on orbital math.
 */
import { createPropagator, type Propagator } from '@orbital/core';
import { geoToScene, altitudeToRadius } from '../lib/geo';

interface InitMsg {
  type: 'init';
  objects: { id: string; name: string; category: string; line1: string; line2: string }[];
}
interface TickMsg {
  type: 'tick';
  timeMs: number;
}
type InboundMsg = InitMsg | TickMsg;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let propagators: (Propagator | null)[] = [];

ctx.onmessage = (event: MessageEvent<InboundMsg>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    propagators = msg.objects.map((o) =>
      createPropagator({
        id: o.id,
        name: o.name,
        category: o.category as never,
        line1: o.line1,
        line2: o.line2,
      }),
    );
    const valid = propagators.reduce((n, p) => n + (p ? 1 : 0), 0);
    ctx.postMessage({ type: 'ready', count: propagators.length, valid });
    return;
  }

  // tick
  const n = propagators.length;
  const positions = new Float32Array(n * 3);
  const alive = new Uint8Array(n);
  const date = new Date(msg.timeMs);
  const v = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < n; i++) {
    const p = propagators[i];
    if (!p) continue;
    const state = p.propagateAt(date);
    if (!state) continue;
    geoToScene(state.latitudeDeg, state.longitudeDeg, altitudeToRadius(state.altitudeKm), v);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    alive[i] = 1;
  }

  ctx.postMessage({ type: 'positions', timeMs: msg.timeMs, positions, alive }, [
    positions.buffer,
    alive.buffer,
  ]);
};
