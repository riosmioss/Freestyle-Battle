import { useEffect, useRef } from 'react';
import type { VoiceState } from '../useVoice';

// Plays a single remote peer's audio. The element is hidden; only sound matters.
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {
        /* autoplay of inbound voice is generally allowed; ignore if not */
      });
    }
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

interface Props {
  voice: VoiceState;
}

// Fixed bottom control bar: mic mute toggle + connection status. Stays mounted
// across phases so peer connections and the mic persist.
export default function VoiceBar({ voice }: Props) {
  const { supported, micReady, micError, muted, toggleMute, remoteStreams } = voice;

  return (
    <div className="voicebar">
      {remoteStreams.map(({ peerId, stream }) => (
        <RemoteAudio key={peerId} stream={stream} />
      ))}

      <div className="voicebar__inner">
        {!supported ? (
          <span className="voicebar__status">Voice not supported on this browser</span>
        ) : micError ? (
          <span className="voicebar__status voicebar__status--err">{micError}</span>
        ) : !micReady ? (
          <span className="voicebar__status">
            <span className="dot dot--off" /> Connecting mic…
          </span>
        ) : (
          <>
            <button
              className={`micbtn ${muted ? 'micbtn--muted' : 'micbtn--live'}`}
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
            >
              <span className="micbtn__icon">{muted ? '🔇' : '🎤'}</span>
              {muted ? 'MUTED' : 'LIVE'}
            </button>
            <span className="voicebar__status">
              {remoteStreams.length > 0
                ? `${remoteStreams.length} peer${remoteStreams.length > 1 ? 's' : ''} connected`
                : 'Waiting for others…'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
