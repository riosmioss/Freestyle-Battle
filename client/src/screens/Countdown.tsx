import { useCountdown } from '../useCountdown';
import type { RoomState } from '../types';

interface Props {
  room: RoomState;
}

export default function Countdown({ room }: Props) {
  const remaining = useCountdown(room.countdownEndsAt);
  const seconds = Math.ceil(remaining / 1000);
  const beat = room.beats.find((b) => b.id === room.activeBeatId);

  return (
    <div className="countdown">
      <p className="countdown__label">BEAT DROPS IN</p>
      {/* key on the second so each number re-triggers the pop animation */}
      <div className="countdown__num" key={seconds}>
        {seconds > 0 ? seconds : 'GO'}
      </div>
      <div className="countdown__rings" aria-hidden>
        <span className="countdown__ring" />
        <span className="countdown__ring" />
        <span className="countdown__ring" />
      </div>
      <p className="countdown__beat">{beat?.label ?? ''}</p>
    </div>
  );
}
