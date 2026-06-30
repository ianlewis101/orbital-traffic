import { useMemo } from 'react';
import { useCatalog, useHotlist } from '../data/queries';
import { useStore } from '../store/useStore';

/** "Popular today" shortcuts — filtered to objects present in the catalog. */
export function HotList() {
  const { data: hotlist } = useHotlist();
  const { data: catalog } = useCatalog();
  const select = useStore((s) => s.select);

  const present = useMemo(() => {
    if (!hotlist || !catalog) return [];
    const ids = new Set(catalog.map((o) => o.id));
    return hotlist.filter((h) => ids.has(h.id));
  }, [hotlist, catalog]);

  if (present.length === 0) return null;

  return (
    <div className="panel hot">
      <div className="panel__head">
        <span className="panel__title">Popular today</span>
      </div>
      <div className="panel__body">
        {present.map((h) => (
          <button key={h.id} className="hot__item" onClick={() => select(h.id)}>
            <div className="hot__name">{h.name}</div>
            <div className="hot__reason">{h.reason}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
