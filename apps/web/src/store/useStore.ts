import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CategoryId } from '@orbital/core';
import { CATEGORIES, CATEGORY_ORDER } from '@orbital/core';
import { simClock } from '../lib/simClock';

export type DataSource = 'cached' | 'live' | 'loading';

interface OrbitalState {
  /** Time-machine multiplier (0 = paused, negative = reverse). */
  rate: number;
  /** Currently selected object id (NORAD id or `neo:Name`), or null. */
  selectedId: string | null;
  /** Hidden orbit classes. */
  hidden: Set<CategoryId>;
  /** Where the live catalog last came from. */
  source: DataSource;
  sourceAt: number | null;
  /** Persisted favourite object ids. */
  favourites: string[];
  /** Imperative "centre the camera on this object" request. */
  focusId: string | null;
  focusNonce: number;

  setRate: (rate: number) => void;
  goLive: () => void;
  jump: (deltaMs: number) => void;
  select: (id: string | null) => void;
  toggleCategory: (cat: CategoryId) => void;
  setSource: (source: DataSource, at?: number) => void;
  toggleFavourite: (id: string) => void;
  isFavourite: (id: string) => boolean;
  focusOn: (id: string) => void;
}

const initialHidden = new Set<CategoryId>(
  CATEGORY_ORDER.filter((c) => CATEGORIES[c].hiddenByDefault),
);

export const useStore = create<OrbitalState>()(
  persist(
    (set, get) => ({
      rate: 1,
      selectedId: null,
      hidden: initialHidden,
      source: 'cached',
      sourceAt: null,
      favourites: [],
      focusId: null,
      focusNonce: 0,

      setRate: (rate) => set({ rate }),
      focusOn: (id) => set((s) => ({ focusId: id, focusNonce: s.focusNonce + 1 })),
      goLive: () => {
        simClock.reset();
        set({ rate: 1 });
      },
      jump: (deltaMs) => simClock.jump(deltaMs),
      select: (selectedId) => set({ selectedId }),
      toggleCategory: (cat) =>
        set((state) => {
          const hidden = new Set(state.hidden);
          if (hidden.has(cat)) hidden.delete(cat);
          else hidden.add(cat);
          return { hidden };
        }),
      setSource: (source, at) => set({ source, sourceAt: at ?? Date.now() }),
      toggleFavourite: (id) =>
        set((state) => {
          const has = state.favourites.includes(id);
          return {
            favourites: has
              ? state.favourites.filter((f) => f !== id)
              : [...state.favourites, id],
          };
        }),
      isFavourite: (id) => get().favourites.includes(id),
    }),
    {
      name: 'orbital-traffic',
      // Only the user's favourites need to survive a reload.
      partialize: (state) => ({ favourites: state.favourites }),
    },
  ),
);
