import { useCountdown } from '../useCountdown';
import type { RoomState } from '../types';

interface Props {
  room: RoomState;
  you: string;
}

export default function Countdown({ room, you }: Props) {
  const remaining = useCountdown(room.countdownEndsAt);
  const seconds = Math.ceil(remaining / 1000);
  const beat = room.beats.find((b) => b.id === room.activeBeatId);
  const performer = room.players.find((p) => p.id === room.currentPerformerId);
  const isYou = room.currentPerformerId === you;
  const turnNum = room.currentTurnIndex + 1;
  const total = room.turnOrder.length;

  return (
    <div className="countdown">
      <p className="countdown__turn">
        TURN {turnNum} / {total}
      </p>
      <p className="countdown__label">{isYou ? 'YOU’RE UP — GET READY' : `${performer?.handle ?? 'MC'} IS UP`}</p>
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
