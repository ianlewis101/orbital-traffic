import { useStore } from '../store/useStore';

const RATES: { value: number; label: string }[] = [
  { value: -300, label: '−300×' },
  { value: -60, label: '−60×' },
  { value: -10, label: '−10×' },
  { value: 0, label: '⏸' },
  { value: 1, label: '1×' },
  { value: 10, label: '10×' },
  { value: 60, label: '60×' },
  { value: 300, label: '300×' },
];

const HOUR = 3600_000;
const DAY = 86_400_000;

function rateBadge(rate: number): string {
  if (rate === 0) return 'PAUSED';
  if (rate === 1) return 'REAL-TIME';
  return `${Math.abs(rate)}× ${rate < 0 ? 'REVERSE' : 'FORWARD'}`;
}

export function TimeMachine() {
  const rate = useStore((s) => s.rate);
  const setRate = useStore((s) => s.setRate);
  const jump = useStore((s) => s.jump);
  const goLive = useStore((s) => s.goLive);

  return (
    <div className="panel timemachine">
      <div className="panel__head">
        <span className="panel__title">Time Machine</span>
        <span className="panel__badge">{rateBadge(rate)}</span>
      </div>
      <div className="panel__body">
        <div className="tm__rates">
          {RATES.map((r) => (
            <button
              key={r.value}
              className={`tm__btn${rate === r.value ? ' active' : ''}`}
              onClick={() => setRate(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="tm__jumps">
          <button className="tm__jump" onClick={() => jump(-DAY)}>
            −1d
          </button>
          <button className="tm__jump" onClick={() => jump(-HOUR)}>
            −1h
          </button>
          <button className="tm__jump live" onClick={goLive}>
            ◉ Now
          </button>
          <button className="tm__jump" onClick={() => jump(HOUR)}>
            +1h
          </button>
          <button className="tm__jump" onClick={() => jump(DAY)}>
            +1d
          </button>
        </div>
      </div>
    </div>
  );
}
