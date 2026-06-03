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
  const beat = room.beats.find((b) => b.id === room.activeBeatId);
  const remaining = useCountdown(room.performEndsAt);
  const total = room.roundLength * 1000;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const low = remaining <= 10_000;

  const beatRef = useRef<BeatPlayerHandle>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const iSaved = room.performedIds.includes(you) || done;

  // Everyone records their verse over the beat for the whole window, then uploads.
  useEffect(() => {
    if (!mic.stream || room.performEndsAt == null) return;
    let stopped = false;
    const chunks: Blob[] = [];
    let beatOffset = 0;

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
      setUploading(false);
      setDone(true);
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
      void finish();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.stream, room.performStartTimestamp]);

  const savedCount = room.performedIds.length;
  const totalPlayers = room.players.length;

  return (
    <div className="performing">
      <p className="performing__tag">
        {iSaved
          ? 'TAKE SAVED'
          : uploading
            ? 'SAVING YOUR TAKE…'
            : recording
              ? 'RECORDING — EVERYONE’S SPITTING NOW'
              : 'GET READY…'}
        {recording && !iSaved && <span className="rec-dot" />}
      </p>

      <div className={`battle__timer ${low ? 'battle__timer--low' : ''}`}>
        {iSaved ? '✓' : fmt(remaining)}
      </div>
      <div className="battle__progress">
        <span className="battle__progress-fill" style={{ width: `${iSaved ? 100 : pct}%` }} />
      </div>

      {beat && <BeatPlayer ref={beatRef} videoId={beat.videoId} className={iSaved ? 'beat-player--hidden' : ''} />}
      <p className="battle__beatlabel">{beat?.label}</p>

      {!iSaved && (
        <button className="btn btn--ghost btn--sm" onClick={() => beatRef.current?.play()}>
          🔊 Can’t hear the beat? Tap to start it
        </button>
      )}

      {!mic.stream && !iSaved && <p className="error">{mic.error ?? 'Waiting for microphone…'}</p>}

      {iSaved ? (
        <>
          <p className="muted performing__hint">
            Your take is in. Waiting for everyone to finish — {savedCount}/{totalPlayers} saved.
          </p>
          <Equalizer bars={11} className="performing__eq" />
        </>
      ) : (
        <p className="muted performing__hint">
          🎧 Headphones recommended. Spit your bars — your take saves automatically when the timer hits zero.
        </p>
      )}

      {/* who's recorded so far */}
      <ul className="turntrack">
        {room.players.map((p) => {
          const saved = room.performedIds.includes(p.id);
          return (
            <li key={p.id} className={`turntrack__item ${saved ? 'is-done' : 'is-active'}`}>
              {p.handle}
              {saved ? <span className="turntrack__check">✓</span> : <span className="rec-dot rec-dot--sm" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
