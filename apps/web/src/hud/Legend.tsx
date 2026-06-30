import { useMemo } from 'react';
import { CATEGORIES, CATEGORY_ORDER, type CategoryId } from '@orbital/core';
import { useCatalog, useNeos } from '../data/queries';
import { useStore } from '../store/useStore';

export function Legend() {
  const { data: catalog } = useCatalog();
  const { data: neos } = useNeos();
  const hidden = useStore((s) => s.hidden);
  const toggle = useStore((s) => s.toggleCategory);

  const counts = useMemo(() => {
    const c = {} as Record<CategoryId, number>;
    for (const id of CATEGORY_ORDER) c[id] = 0;
    for (const o of catalog ?? []) c[o.category]++;
    c.hazardous = neos?.length ?? 0;
    return c;
  }, [catalog, neos]);

  const total = catalog?.length ?? 0;

  return (
    <div className="panel legend">
      <div className="panel__head">
        <span className="panel__title">Orbit classes</span>
        <span className="panel__badge">{total.toLocaleString('en-US')}</span>
      </div>
      <div className="panel__body">
        {CATEGORY_ORDER.filter((id) => counts[id] > 0).map((id) => {
          const meta = CATEGORIES[id];
          const off = hidden.has(id);
          return (
            <button
              key={id}
              className={`legend__row${off ? ' off' : ''}`}
              onClick={() => toggle(id)}
              aria-pressed={!off}
            >
              <span className="glyph" style={{ color: meta.cssColor }}>
                {meta.glyph}
              </span>
              <span className="legend__name">{meta.label}</span>
              <span className="legend__count">{counts[id].toLocaleString('en-US')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
