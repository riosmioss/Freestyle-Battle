import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import type { PublicLobby, RoomState } from './types';

interface Ack {
  ok: boolean;
  error?: string;
  code?: string;
  you?: string;
}

// Central client-side game state. Listens to the server's authoritative
// `roomState` broadcasts and exposes typed action helpers.
export function useGame() {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [you, setYou] = useState<string>(socket.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<PublicLobby[]>([]);
  // Track the room code we belong to so a phase change can't be confused.
  const codeRef = useRef<string | null>(null);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setYou(socket.id ?? '');
    };
    const onDisconnect = () => setConnected(false);
    const onRoomState = (state: RoomState) => {
      codeRef.current = state.code;
      setRoom(state);
    };
    const onPublicLobbies = (list: PublicLobby[]) => setPublicLobbies(list);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomState', onRoomState);
    socket.on('publicLobbies', onPublicLobbies);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomState', onRoomState);
      socket.off('publicLobbies', onPublicLobbies);
    };
  }, []);

  // While on the home screen (no room), subscribe to the live public lobby list.
  useEffect(() => {
    if (room) return;
    socket.emit('watchLobbies');
    return () => {
      socket.emit('unwatchLobbies');
    };
  }, [room]);

  const emitAck = useCallback(
    (event: string, payload: unknown) =>
      new Promise<Ack>((resolve) => {
        socket.emit(event, payload, (res: Ack) => {
          if (res && res.ok === false) setError(res.error ?? 'Something went wrong.');
          resolve(res ?? { ok: false });
        });
      }),
    [],
  );

  const createLobby = useCallback(
    async (handle: string, isPublic: boolean) => {
      setError(null);
      return emitAck('createLobby', { handle, isPublic });
    },
    [emitAck],
  );

  const joinLobby = useCallback(
    async (code: string, handle: string) => {
      setError(null);
      return emitAck('joinLobby', { code: code.toUpperCase(), handle });
    },
    [emitAck],
  );

  const addBeat = useCallback((url: string, label: string) => emitAck('addBeat', { url, label }), [emitAck]);
  const removeBeat = useCallback((beatId: string) => emitAck('removeBeat', { beatId }), [emitAck]);
  const selectBeat = useCallback((beatId: string) => emitAck('selectBeat', { beatId }), [emitAck]);
  const setRoundLength = useCallback((seconds: number) => emitAck('setRoundLength', { seconds }), [emitAck]);
  const setPublic = useCallback((isPublic: boolean) => emitAck('setPublic', { isPublic }), [emitAck]);
  const startBattle = useCallback(() => emitAck('startBattle', {}), [emitAck]);
  const submitRating = useCallback(
    (ratings: Record<string, number>) => emitAck('submitRating', { ratings }),
    [emitAck],
  );
  const nextRound = useCallback(() => emitAck('nextRound', {}), [emitAck]);
  const returnToLobby = useCallback(() => emitAck('returnToLobby', {}), [emitAck]);
  const leaveLobby = useCallback(() => {
    socket.emit('leaveLobby');
    setRoom(null);
    codeRef.current = null;
  }, []);

  return {
    connected,
    room,
    you,
    error,
    publicLobbies,
    clearError: () => setError(null),
    actions: {
      createLobby,
      joinLobby,
      addBeat,
      removeBeat,
      selectBeat,
      setRoundLength,
      setPublic,
      startBattle,
      submitRating,
      nextRound,
      returnToLobby,
      leaveLobby,
    },
  };
}

export type GameActions = ReturnType<typeof useGame>['actions'];
