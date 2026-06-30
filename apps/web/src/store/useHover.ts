import { create } from 'zustand';

interface HoverState {
  id: string | null;
  name: string | null;
  x: number;
  y: number;
  set: (hover: { id: string; name: string; x: number; y: number } | null) => void;
}

/** Isolated store for pointer hover so only the tooltip re-renders on move. */
export const useHover = create<HoverState>((set) => ({
  id: null,
  name: null,
  x: 0,
  y: 0,
  set: (hover) =>
    set(hover ? { id: hover.id, name: hover.name, x: hover.x, y: hover.y } : { id: null, name: null }),
}));
