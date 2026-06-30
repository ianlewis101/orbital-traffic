import * as THREE from 'three';
import type { CategoryId, OrbitalObject } from '@orbital/core';
import { CATEGORIES } from '@orbital/core';

interface ReadyMsg {
  type: 'ready';
  count: number;
  valid: number;
}
interface PositionsMsg {
  type: 'positions';
  timeMs: number;
  positions: Float32Array;
  alive: Uint8Array;
}
type WorkerMsg = ReadyMsg | PositionsMsg;

/**
 * Bridges the propagation worker to a single Three.js `Points` geometry.
 *
 * - `position` is refreshed from the worker on a self-paced loop (a new tick is
 *   only requested once the previous result lands, so the worker is never
 *   flooded and the render thread never waits).
 * - `aShow` toggles per-object visibility (alive ∧ category-visible) without
 *   re-uploading the whole buffer every frame.
 */
export class SatelliteField {
  readonly objects: OrbitalObject[];
  readonly count: number;
  readonly geometry: THREE.BufferGeometry;

  readonly positions: Float32Array;
  private readonly alive: Uint8Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly showAttr: THREE.BufferAttribute;
  private readonly indexById = new Map<string, number>();

  private readonly worker: Worker;
  private ready = false;
  private awaiting = false;
  private aliveVersion = 0;
  private lastShowSig = '';

  constructor(objects: OrbitalObject[]) {
    this.objects = objects;
    this.count = objects.length;
    this.positions = new Float32Array(this.count * 3);
    this.alive = new Uint8Array(this.count);

    const colors = new Float32Array(this.count * 3);
    const show = new Float32Array(this.count);
    const c = new THREE.Color();
    objects.forEach((o, i) => {
      this.indexById.set(o.id, i);
      c.setHex(CATEGORIES[o.category].color);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      show[i] = 0;
    });

    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.showAttr = new THREE.BufferAttribute(show, 1);
    this.showAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aShow', this.showAttr);
    // Objects sit out to GEO+ (~7 units); a fixed bounding sphere keeps the
    // whole field from being frustum-culled when positions stream in.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 9);
    this.geometry = g;

    this.worker = new Worker(new URL('./propagator.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent<WorkerMsg>) => this.onMessage(e.data);
    this.worker.postMessage({
      type: 'init',
      objects: objects.map((o) => ({
        id: o.id,
        name: o.name,
        category: o.category,
        line1: o.line1,
        line2: o.line2,
      })),
    });
  }

  private onMessage(msg: WorkerMsg): void {
    if (msg.type === 'ready') {
      this.ready = true;
      return;
    }
    this.positions.set(msg.positions);
    this.alive.set(msg.alive);
    this.aliveVersion++;
    this.posAttr.needsUpdate = true;
    this.awaiting = false;
  }

  /** Called every frame: refresh visibility and request the next propagation. */
  update(date: Date, hidden: Set<CategoryId>): void {
    this.applyVisibility(hidden);
    if (this.ready && !this.awaiting) {
      this.awaiting = true;
      this.worker.postMessage({ type: 'tick', timeMs: date.getTime() });
    }
  }

  private applyVisibility(hidden: Set<CategoryId>): void {
    const sig = `${[...hidden].sort().join(',')}|${this.aliveVersion}`;
    if (sig === this.lastShowSig) return;
    this.lastShowSig = sig;
    const show = this.showAttr.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const visible = this.alive[i] === 1 && !hidden.has(this.objects[i]!.category);
      show[i] = visible ? 1 : 0;
    }
    this.showAttr.needsUpdate = true;
  }

  /** Latest scene position of an object, or null if unknown/decayed. */
  positionOf(id: string): THREE.Vector3 | null {
    const i = this.indexById.get(id);
    if (i === undefined || this.alive[i] !== 1) return null;
    return new THREE.Vector3(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
  }

  objectAt(id: string): OrbitalObject | undefined {
    const i = this.indexById.get(id);
    return i === undefined ? undefined : this.objects[i];
  }

  /**
   * Pick the visible object nearest the pointer (NDC), ignoring objects hidden
   * behind the globe. Runs on click only, so a linear scan is fine.
   */
  pick(camera: THREE.Camera, ndcX: number, ndcY: number, thresholdNdc: number): string | null {
    const show = this.showAttr.array as Float32Array;
    const p = new THREE.Vector3();
    const cam = camera.position;
    let best = -1;
    let bestDist = thresholdNdc * thresholdNdc;

    for (let i = 0; i < this.count; i++) {
      if (show[i]! < 0.5) continue;
      const x = this.positions[i * 3]!;
      const y = this.positions[i * 3 + 1]!;
      const z = this.positions[i * 3 + 2]!;
      if (isOccludedByGlobe(cam.x, cam.y, cam.z, x, y, z)) continue;
      p.set(x, y, z).project(camera);
      if (p.z > 1) continue; // clipped / behind camera
      const dx = p.x - ndcX;
      const dy = p.y - ndcY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best >= 0 ? this.objects[best]!.id : null;
  }

  dispose(): void {
    this.worker.terminate();
    this.geometry.dispose();
  }
}

/** True if the segment camera→point crosses the unit globe before the point. */
function isOccludedByGlobe(
  cx: number,
  cy: number,
  cz: number,
  px: number,
  py: number,
  pz: number,
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return false;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const b = 2 * (cx * ux + cy * uy + cz * uz);
  const c = cx * cx + cy * cy + cz * cz - 1; // unit sphere
  const disc = b * b - 4 * c;
  if (disc <= 0) return false;
  const t = (-b - Math.sqrt(disc)) / 2;
  return t > 0.002 && t < len - 0.002;
}
