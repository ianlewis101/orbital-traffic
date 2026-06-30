import { useMemo, useState } from 'react';
import { CATEGORIES } from '@orbital/core';
import { useCatalog, useNeos } from '../data/queries';
import { useStore } from '../store/useStore';

interface Result {
  id: string;
  name: string;
  meta: string;
  glyph: string;
  color: string;
}

const MAX_RESULTS = 18;

export function SearchBox() {
  const [query, setQuery] = useState('');
  const { data: catalog } = useCatalog();
  const { data: neos } = useNeos();
  const select = useStore((s) => s.select);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Result[] = [];
    for (const o of catalog ?? []) {
      if (o.name.toLowerCase().includes(q) || o.id.includes(q)) {
        const meta = CATEGORIES[o.category];
        out.push({ id: o.id, name: o.name, meta: `${meta.label} · ${o.id}`, glyph: meta.glyph, color: meta.cssColor });
        if (out.length >= MAX_RESULTS) break;
      }
    }
    for (const n of neos ?? []) {
      if (out.length >= MAX_RESULTS) break;
      if (n.name.toLowerCase().includes(q)) {
        const meta = CATEGORIES.hazardous;
        out.push({
          id: `neo:${n.name}`,
          name: n.name,
          meta: `Hazardous NEO · ${n.cls ?? 'asteroid'}`,
          glyph: meta.glyph,
          color: meta.cssColor,
        });
      }
    }
    return out;
  }, [query, catalog, neos]);

  const choose = (id: string) => {
    select(id);
    setQuery('');
  };

  return (
    <div className="search">
      <div className="panel search__box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="SEARCH CATALOG OR NORAD ID"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the satellite catalog"
        />
      </div>
      {results.length > 0 && (
        <div className="panel search__results">
          <div className="panel__body">
            {results.map((r) => (
              <button key={r.id} className="result" onClick={() => choose(r.id)}>
                <span className="glyph" style={{ color: r.color }}>
                  {r.glyph}
                </span>
                <span>
                  <span className="result__name">{r.name}</span>
                  <br />
                  <span className="result__meta">{r.meta}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
