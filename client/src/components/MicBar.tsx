import type { MicState } from '../useMic';

interface Props {
  mic: MicState;
}

// Slim status strip so players know their mic is ready to record their turn.
export default function MicBar({ mic }: Props) {
  return (
    <div className="voicebar">
      <div className="voicebar__inner">
        {!mic.supported ? (
          <span className="voicebar__status voicebar__status--err">
            Recording isn’t supported on this browser.
          </span>
        ) : mic.error ? (
          <span className="voicebar__status voicebar__status--err">{mic.error}</span>
        ) : mic.ready ? (
          <span className="voicebar__status">
            <span className="dot dot--live" /> Mic ready — you’ll record on your turn
          </span>
        ) : (
          <span className="voicebar__status">
            <span className="dot dot--off" /> Connecting mic…
          </span>
        )}
      </div>
    </div>
  );
}
