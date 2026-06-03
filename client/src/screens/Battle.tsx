import SyncedBeatPlayer from '../components/SyncedBeatPlayer';
import Equalizer from '../components/Equalizer';
import { useCountdown } from '../useCountdown';
import type { RoomState } from '../types';
import { isTalking } from '../useVoice';

interface Props {
  room: RoomState;
  you: string;
  levels: Record<string, number>;
}

function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Battle({ room, you, levels }: Props) {
  const remaining = useCountdown(room.roundEndsAt);
  const beat = room.beats.find((b) => b.id === room.activeBeatId);
  const total = room.roundLength * 1000;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const low = remaining <= 10_000;

  return (
    <div className="battle">
      <div className="battle__timerwrap">
        <p className="battle__phase">LIVE · ROUND {room.roundNumber}</p>
        <div className={`battle__timer ${low ? 'battle__timer--low' : ''}`}>{fmt(remaining)}</div>
        <div className="battle__progress">
          <span className="battle__progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <Equalizer bars={13} className="battle__eq" />

      {beat && room.roundStartTimestamp != null && (
        <SyncedBeatPlayer videoId={beat.videoId} roundStartTimestamp={room.roundStartTimestamp} active />
      )}
      <p className="battle__beatlabel">{beat?.label}</p>

      <ul className="battle__mics">
        {room.players.map((p) => (
          <li
            key={p.id}
            className={`mic ${p.id === you ? 'mic--you' : ''} ${isTalking(levels[p.id]) ? 'mic--talking' : ''}`}
          >
            <span className={`dot ${p.online ? 'dot--live' : 'dot--off'}`} />
            {p.handle}
          </li>
        ))}
      </ul>

      <p className="muted battle__hint">Spit your bars — rating drops when the timer hits zero.</p>
    </div>
  );
}
