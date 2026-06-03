import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import type { Player } from './types';

// Full-mesh WebRTC voice using "perfect negotiation" so any pair of peers can
// connect without glare. Socket.IO relays the SDP/ICE. Lobbies are <=8 so a
// mesh is fine. The beat (YouTube) audio is entirely separate from these
// voice streams.

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

const TALK_THRESHOLD = 0.045; // RMS level above which we consider someone "talking"

interface PeerConn {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  analyser?: AnalyserNode;
  stream?: MediaStream;
}

export interface VoiceState {
  supported: boolean;
  micReady: boolean;
  micError: string | null;
  muted: boolean;
  toggleMute: () => void;
  // peerId (incl. your own id) -> 0..1 audio level
  levels: Record<string, number>;
  // remote streams to render as <audio> elements
  remoteStreams: { peerId: string; stream: MediaStream }[];
}

export function useVoice(enabled: boolean, players: Player[], you: string): VoiceState {
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [remoteStreams, setRemoteStreams] = useState<{ peerId: string; stream: MediaStream }[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConn>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const youRef = useRef(you);
  youRef.current = you;

  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.RTCPeerConnection;

  // ---- Acquire microphone once voice is enabled ----
  useEffect(() => {
    if (!enabled || !supported) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        localAnalyserRef.current = analyser;

        setMicReady(true);
      } catch (err: any) {
        if (!cancelled) {
          setMicError(
            err?.name === 'NotAllowedError'
              ? 'Mic blocked. Allow microphone access to go live.'
              : 'Could not access a microphone.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, supported]);

  // ---- Peer connection plumbing ----
  const createPeer = useCallback((peerId: string): PeerConn => {
    const polite = youRef.current < peerId; // deterministic, symmetric across the pair
    const pc = new RTCPeerConnection(ICE_SERVERS);
    const entry: PeerConn = { pc, polite, makingOffer: false };

    // Send our mic to them.
    const local = localStreamRef.current;
    if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('rtcIce', { to: peerId, candidate });
    };

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('rtcOffer', { to: peerId, description: pc.localDescription });
      } catch {
        /* noop */
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      entry.stream = stream;
      setRemoteStreams((prev) => {
        if (prev.some((p) => p.peerId === peerId)) return prev;
        return [...prev, { peerId, stream }];
      });
      // Hook a level meter onto the remote audio.
      const ctx = audioCtxRef.current;
      if (ctx) {
        try {
          const src = ctx.createMediaStreamSource(stream);
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          entry.analyser = an;
        } catch {
          /* noop */
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        try {
          pc.restartIce();
        } catch {
          /* noop */
        }
      }
    };

    peersRef.current.set(peerId, entry);
    return entry;
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId);
    if (entry) {
      try {
        entry.pc.close();
      } catch {
        /* noop */
      }
      peersRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => prev.filter((p) => p.peerId !== peerId));
  }, []);

  // ---- Reconcile the mesh against the current player list ----
  useEffect(() => {
    if (!micReady) return;
    const others = new Set(players.filter((p) => p.id !== youRef.current).map((p) => p.id));

    // Add connections for new peers.
    for (const id of others) {
      if (!peersRef.current.has(id)) createPeer(id);
    }
    // Drop connections for peers who left.
    for (const id of [...peersRef.current.keys()]) {
      if (!others.has(id)) closePeer(id);
    }
  }, [players, micReady, createPeer, closePeer]);

  // ---- Signaling handlers (perfect negotiation) ----
  useEffect(() => {
    if (!micReady) return;

    const onDescription = async ({ from, description }: { from: string; description: RTCSessionDescriptionInit }) => {
      if (!from || !description) return;
      let entry = peersRef.current.get(from);
      if (!entry) entry = createPeer(from);
      const { pc } = entry;

      const offerCollision = description.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable');
      const ignoreOffer = !entry.polite && offerCollision;
      if (ignoreOffer) return;

      try {
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('rtcAnswer', { to: from, description: pc.localDescription });
        }
      } catch {
        /* noop */
      }
    };

    const onIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const entry = peersRef.current.get(from);
      if (!entry || !candidate) return;
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch {
        /* ignore — candidate may arrive before remote description */
      }
    };

    const onPeerLeft = ({ id }: { id: string }) => closePeer(id);

    socket.on('rtcOffer', onDescription);
    socket.on('rtcAnswer', onDescription);
    socket.on('rtcIce', onIce);
    socket.on('peerLeft', onPeerLeft);

    return () => {
      socket.off('rtcOffer', onDescription);
      socket.off('rtcAnswer', onDescription);
      socket.off('rtcIce', onIce);
      socket.off('peerLeft', onPeerLeft);
    };
  }, [micReady, createPeer, closePeer]);

  // ---- Audio level metering loop ----
  useEffect(() => {
    if (!micReady) return;
    let raf = 0;
    const buf = new Uint8Array(256);

    const rms = (analyser?: AnalyserNode) => {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(buf as any);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buf.length);
    };

    let lastUpdate = 0;
    const tick = (t: number) => {
      if (t - lastUpdate > 90) {
        lastUpdate = t;
        const next: Record<string, number> = {};
        // self (zero while muted)
        next[youRef.current] = muted ? 0 : rms(localAnalyserRef.current ?? undefined);
        for (const [peerId, entry] of peersRef.current) {
          next[peerId] = rms(entry.analyser);
        }
        setLevels(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [micReady, muted]);

  // ---- Mute toggle ----
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      const local = localStreamRef.current;
      if (local) local.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  // ---- Teardown when voice disabled / unmounted ----
  useEffect(() => {
    if (enabled) return;
    return;
  }, [enabled]);

  useEffect(() => {
    return () => {
      peersRef.current.forEach((e) => {
        try {
          e.pc.close();
        } catch {
          /* noop */
        }
      });
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return {
    supported,
    micReady,
    micError,
    muted,
    toggleMute,
    levels,
    remoteStreams,
  };
}

// Convenience for components: is this level "talking"?
export const isTalking = (level: number | undefined) => (level ?? 0) > TALK_THRESHOLD;
