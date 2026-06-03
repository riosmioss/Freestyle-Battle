import { useEffect, useRef, useState } from 'react';
import BeatPlayer, { type BeatPlayerHandle } from '../components/BeatPlayer';
import Equalizer from '../components/Equalizer';
import { getServerNow } from '../socket';
import { useCountdown } from '../useCountdown';
import { pickRecordingMime, type MicState } from '../useMic';
import type { RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  mic: MicState;
  actions: GameActions;
}

function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Performing({ room, you, mic, actions }: Props) {
  const isMyTurn = room.currentPerformerId === you;
  const performer = room.players.find((p) => p.id === room.currentPerformerId);
  const beat = room.beats.find((b) => b.id === room.activeBeatId);
  const remaining = useCountdown(room.performEndsAt);
  const total = room.roundLength * 1000;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const low = remaining <= 10_000;

  const beatRef = useRef<BeatPlayerHandle>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Record my verse over the beat for the duration of my turn, then upload.
  useEffect(() => {
    if (!isMyTurn || !mic.stream || room.performEndsAt == null) return;
    let stopped = false;
    const chunks: Blob[] = [];
    let beatOffset = 0;

    // Play the beat so I can rap to it.
    beatRef.current?.seekTo(0);
    beatRef.current?.play();

    let rec: MediaRecorder;
    try {
      const mime = pickRecordingMime();
      rec = mime ? new MediaRecorder(mic.stream, { mimeType: mime }) : new MediaRecorder(mic.stream);
    } catch {
      return;
    }

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onstart = () => {
      beatOffset = beatRef.current?.getTime() ?? 0;
      setRecording(true);
    };

    const finish = async () => {
      if (stopped) return;
      stopped = true;
      try {
        if (rec.state !== 'inactive') {
          await new Promise<void>((res) => {
            rec.onstop = () => res();
            rec.stop();
          });
        }
      } catch {
        /* noop */
      }
      setRecording(false);
      setUploading(true);
      try {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const buf = await blob.arrayBuffer();
        await actions.submitRecording(beatOffset, type, buf);
      } catch {
        /* noop */
      }
      beatRef.current?.pause();
    };

    try {
      rec.start();
    } catch {
      return;
    }

    const ms = Math.max(0, (room.performEndsAt ?? 0) - getServerNow());
    const timer = window.setTimeout(finish, ms);

    return () => {
      clearTimeout(timer);
      // Upload whatever we have if the turn ends for any reason.
      void finish();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, mic.stream, room.performStartTimestamp]);

  // ---- Your turn ----
  if (isMyTurn) {
    return (
      <div className="performing performing--you">
        <p className="performing__tag">
          {uploading ? 'SAVING YOUR TAKE…' : recording ? 'YOU’RE UP · RECORDING' : 'GET READY…'}
          {recording && <span className="rec-dot" />}
        </p>
        <div className={`battle__timer ${low ? 'battle__timer--low' : ''}`}>{fmt(remaining)}</div>
        <div className="battle__progress">
          <span className="battle__progress-fill" style={{ width: `${pct}%` }} />
        </div>

        {beat && <BeatPlayer ref={beatRef} videoId={beat.videoId} />}
        <p className="battle__beatlabel">{beat?.label}</p>

        <button className="btn btn--ghost btn--sm" onClick={() => beatRef.current?.play()}>
          🔊 Can’t hear the beat? Tap to start it
        </button>

        {!mic.stream && (
          <p className="error">{mic.error ?? 'Waiting for microphone…'}</p>
        )}
        <p className="muted performing__hint">
          🎧 Headphones recommended. Spit your bars — your take saves automatically when the timer hits zero.
        </p>
      </div>
    );
  }

  // ---- Someone else's turn ----
  return (
    <div className="performing performing--watch">
      <p className="performing__tag">ON THE MIC</p>
      <h1 className="performing__name">{performer?.handle ?? 'MC'}</h1>
      <Equalizer bars={15} className="performing__eq" />
      <div className={`battle__timer ${low ? 'battle__timer--low' : ''}`}>{fmt(remaining)}</div>
      <div className="battle__progress">
        <span className="battle__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted performing__hint">
        They’re recording their verse. You’ll hear every take in the rating round.
      </p>

      {/* turn tracker */}
      <ul className="turntrack">
        {room.turnOrder.map((id, i) => {
          const pl = room.players.find((p) => p.id === id);
          const done = room.performedIds.includes(id);
          const active = id === room.currentPerformerId;
          return (
            <li key={id} className={`turntrack__item ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
              <span className="turntrack__num">{i + 1}</span>
              {pl?.handle ?? 'MC'}
              {done && <span className="turntrack__check">✓</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
