export function Splash({ gone, message }: { gone: boolean; message: string }) {
  return (
    <div className={`splash${gone ? ' gone' : ''}`} aria-hidden={gone}>
      <div className="splash__mark">Orbital Traffic</div>
      <div className="splash__bar">
        <i />
      </div>
      <div className="splash__msg">{message}</div>
    </div>
  );
}
