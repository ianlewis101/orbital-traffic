import { useFrame } from '@react-three/fiber';
import { simClock } from '../lib/simClock';
import { useStore } from '../store/useStore';

/**
 * Advances the simulated clock exactly once per frame, before any other
 * `useFrame` consumer reads it. Mount this first inside the Canvas.
 */
export function SimDriver() {
  useFrame(() => {
    simClock.advance(useStore.getState().rate);
  }, -10);
  return null;
}
