import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConfigureRoomPayload,
  GuessResult,
  JoinRoomResult,
  PublicGuess,
  RoomView,
} from '@moji/shared';
import { emitAck, socket } from './socket.js';

const TOKEN_KEY = 'moji.sessionToken';

export interface GameClient {
  connected: boolean;
  view: RoomView | null;
  feed: PublicGuess[];
  error: string | null;
  myId: string | null;
  join(displayName: string, avatar: string, code?: string): Promise<JoinRoomResult>;
  configure(payload: ConfigureRoomPayload): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  start(): Promise<void>;
  reshuffle(): Promise<void>;
  submitClue(emojis: string[]): Promise<void>;
  submitGuess(text: string): Promise<GuessResult>;
  skip(): Promise<void>;
  next(): Promise<void>;
  clearError(): void;
}

export function useGame(): GameClient {
  const [connected, setConnected] = useState(socket.connected);
  const [view, setView] = useState<RoomView | null>(null);
  const [feed, setFeed] = useState<PublicGuess[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const activeAuthorRef = useRef<string | null>(null);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (next: RoomView) => {
      // Reset the live feed when a new clue starts.
      const author = next.activeClue?.authorId ?? null;
      if (author !== activeAuthorRef.current) {
        activeAuthorRef.current = author;
        setFeed([]);
      }
      setView(next);
    };
    const onGuess = (g: PublicGuess) => setFeed((f) => [...f, g].slice(-100));
    const onError = (msg: string) => setError(msg);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('guess:new', onGuess);
    socket.on('error', onError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('guess:new', onGuess);
      socket.off('error', onError);
    };
  }, []);

  const join = useCallback<GameClient['join']>(async (displayName, avatar, code) => {
    const sessionToken = localStorage.getItem(TOKEN_KEY) ?? undefined;
    const res = await emitAck<JoinRoomResult>('room:join', {
      displayName,
      avatar,
      code,
      sessionToken,
    });
    localStorage.setItem(TOKEN_KEY, res.sessionToken);
    setMyId(res.playerId);
    return res;
  }, []);

  const configure = useCallback<GameClient['configure']>(
    (payload) => emitAck('room:configure', payload),
    [],
  );
  const setReady = useCallback<GameClient['setReady']>(
    (ready) => emitAck('player:ready', ready),
    [],
  );
  const start = useCallback<GameClient['start']>(() => emitAck('game:start'), []);
  const reshuffle = useCallback<GameClient['reshuffle']>(() => emitAck('clue:reshuffle'), []);
  const submitClue = useCallback<GameClient['submitClue']>(
    (emojis) => emitAck('clue:submit', { emojis }),
    [],
  );
  const submitGuess = useCallback<GameClient['submitGuess']>(
    (text) => emitAck<GuessResult>('guess:submit', { text }),
    [],
  );
  const skip = useCallback<GameClient['skip']>(() => emitAck('host:skip'), []);
  const next = useCallback<GameClient['next']>(() => emitAck('host:next'), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    connected,
    view,
    feed,
    error,
    myId,
    join,
    configure,
    setReady,
    start,
    reshuffle,
    submitClue,
    submitGuess,
    skip,
    next,
    clearError,
  };
}
