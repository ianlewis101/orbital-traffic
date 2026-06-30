import { useHover } from '../store/useHover';

export function Tooltip() {
  const { id, name, x, y } = useHover();
  if (!id) return null;
  return (
    <div className="tooltip" style={{ left: x, top: y }}>
      {name}
    </div>
  );
}
