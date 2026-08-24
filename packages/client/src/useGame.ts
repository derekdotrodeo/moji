import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConfigureRoomPayload,
  GuessResult,
  JoinRoomResult,
  PublicGuess,
  RoomView,
} from '@moji/shared';
import { emitAck, socket } from './socket.js';
import { clearToken, getToken, saveSession } from './session.js';

export interface GameClient {
  connected: boolean;
  view: RoomView | null;
  feed: PublicGuess[];
  /** Letter blanks for the active clue, filling in during GUESSING. */
  hint: string | null;
  error: string | null;
  myId: string | null;
  join(displayName: string, avatar: string, code?: string): Promise<JoinRoomResult>;
  configure(payload: ConfigureRoomPayload): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  start(): Promise<void>;
  reshuffle(): Promise<void>;
  leave(): Promise<void>;
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
  const [hint, setHint] = useState<string | null>(null);
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
        setHint(next.activeClue?.hint ?? null);
      } else {
        // Same clue: keep what the tick stream gave us, but pick up the mask
        // from the snapshot when we don't have one yet (guessing just opened,
        // or we reconnected mid-clue).
        setHint((cur) => cur ?? next.activeClue?.hint ?? null);
      }
      setView(next);
    };
    const onGuess = (g: PublicGuess) => setFeed((f) => [...f, g].slice(-100));
    const onHint = (h: string) => setHint(h);
    const onError = (msg: string) => setError(msg);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('guess:new', onGuess);
    socket.on('clue:hint', onHint);
    socket.on('error', onError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('guess:new', onGuess);
      socket.off('clue:hint', onHint);
      socket.off('error', onError);
    };
  }, []);

  const join = useCallback<GameClient['join']>(async (displayName, avatar, code) => {
    const res = await emitAck<JoinRoomResult>('room:join', {
      displayName,
      avatar,
      code,
      sessionToken: getToken(),
    });
    saveSession(res.sessionToken, displayName, avatar);
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
  const leave = useCallback<GameClient['leave']>(async () => {
    try {
      await emitAck('room:leave');
    } catch {
      /* leaving best-effort */
    }
    clearToken();
    setMyId(null);
    setFeed([]);
    setView(null);
  }, []);
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
    hint,
    error,
    myId,
    join,
    configure,
    setReady,
    start,
    reshuffle,
    leave,
    submitClue,
    submitGuess,
    skip,
    next,
    clearError,
  };
}
