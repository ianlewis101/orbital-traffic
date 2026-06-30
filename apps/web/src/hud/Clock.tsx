import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { simClock } from '../lib/simClock';
import { useStore } from '../store/useStore';
import { fetchLiveCatalog } from '../data/queries';
import { CLOCK_SAMPLE_MS } from '../config';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function Clock() {
  const [now, setNow] = useState(() => simClock.date());
  const source = useStore((s) => s.source);
  const rate = useStore((s) => s.rate);
  const setSource = useStore((s) => s.setSource);
  const queryClient = useQueryClient();

  useEffect(() => {
    const id = setInterval(() => setNow(simClock.date()), CLOCK_SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const realtime = rate === 1 && Math.abs(simClock.nowMs - Date.now()) < 4000;
  const hms = now.toISOString().slice(11, 19);
  const date = `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  const fetchLive = async () => {
    if (source === 'loading') return;
    setSource('loading');
    try {
      await fetchLiveCatalog(queryClient);
      setSource('live');
    } catch {
      setSource('cached');
    }
  };

  const sourceClass =
    source === 'live' ? 'src-live' : source === 'loading' ? 'src-loading' : 'src-cached';
  const sourceLabel =
    source === 'live' ? 'Live data' : source === 'loading' ? 'Syncing…' : 'Cached data';

  return (
    <div className="panel clock">
      <div className="panel__head">
        <span className="panel__title">Mission time · UTC</span>
        <span className="panel__badge">{realtime ? 'LIVE' : 'SIM'}</span>
      </div>
      <div className="panel__body">
        <div className="clock__time">
          {hms}
          <small>UTC</small>
        </div>
        <div className="clock__date">{date}</div>
        <div className="clock__source">
          <span className={sourceClass}>
            <span className="dot" />
          </span>
          <span>{sourceLabel}</span>
          <button className="live-btn" onClick={fetchLive} disabled={source === 'loading'}>
            Fetch live
          </button>
        </div>
      </div>
    </div>
  );
}
