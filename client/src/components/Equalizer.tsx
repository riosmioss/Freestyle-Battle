interface Props {
  bars?: number;
  active?: boolean;
  className?: string;
}

// Pure-CSS animated equalizer bars — the recurring "sound" motif.
export default function Equalizer({ bars = 7, active = true, className = '' }: Props) {
  return (
    <div className={`eq ${active ? 'eq--active' : ''} ${className}`} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className="eq__bar" style={{ animationDelay: `${(i % bars) * 0.12}s` }} />
      ))}
    </div>
  );
}
