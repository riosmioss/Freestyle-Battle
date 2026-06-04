import { getBeat } from '../beats';
import { useCountdown } from '../useCountdown';
import type { RoomState } from '../types';

interface Props {
  room: RoomState;
}

export default function Countdown({ room }: Props) {
  const remaining = useCountdown(room.countdownEndsAt);
  const seconds = Math.ceil(remaining / 1000);
  const beat = getBeat(room.activeBeatId);

  return (
    <div className="countdown">
      <p className="countdown__turn">ROUND {room.roundNumber} · EVERYONE RECORDS</p>
      <p className="countdown__label">BEAT DROPS IN</p>
      <div className="countdown__num" key={seconds}>
        {seconds > 0 ? seconds : 'GO'}
      </div>
      <div className="countdown__rings" aria-hidden>
        <span className="countdown__ring" />
        <span className="countdown__ring" />
        <span className="countdown__ring" />
      </div>
      <p className="countdown__beat">{beat ? `🎧 ${beat.title}` : ''}</p>
    </div>
  );
}
