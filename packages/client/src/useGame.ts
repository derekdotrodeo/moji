import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
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
  /** The solvers' side channel for the active clue; empty until we can see it. */
  chat: ChatMessage[];
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
  bump(): Promise<void>;
  sendChat(text: string): Promise<void>;
  skip(): Promise<void>;
  next(): Promise<void>;
  clearError(): void;
}

/** Union of the live guess stream and the snapshot's, oldest first, deduped by id. */
function mergeFeed(local: PublicGuess[], snapshot: PublicGuess[]): PublicGuess[] {
  const byId = new Map(snapshot.map((g) => [g.id, g]));
  for (const g of local) if (!byId.has(g.id)) byId.set(g.id, g);
  return [...byId.values()]
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .slice(-100);
}

export function useGame(): GameClient {
  const [connected, setConnected] = useState(socket.connected);
  const [view, setView] = useState<RoomView | null>(null);
  const [feed, setFeed] = useState<PublicGuess[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
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
        // Seed from the snapshot rather than emptying: `guess:new` only reaches
        // clients that were connected when it fired, so a player who joined,
        // reloaded, or reconnected mid-clue would otherwise stare at an empty
        // feed until somebody guessed again. The server scopes guessFeed to the
        // current clue, so this can't drag in the previous one's guesses.
        setFeed(next.guessFeed);
        setChat(next.clueChat);
        setHint(next.activeClue?.hint ?? null);
      } else {
        // Same clue: union the snapshot with what the live stream gave us.
        // Neither is a superset — the snapshot can be a tick behind the events,
        // and the events miss anything from before we connected.
        setFeed((cur) => mergeFeed(cur, next.guessFeed));
        // The snapshot is authoritative for chat: it is empty until we're
        // entitled to it, then arrives whole (on solving, or on the reveal).
        setChat(next.clueChat);
        // Same clue: keep what the tick stream gave us, but pick up the mask
        // from the snapshot when we don't have one yet (guessing just opened,
        // or we reconnected mid-clue).
        setHint((cur) => cur ?? next.activeClue?.hint ?? null);
      }
      setView(next);
    };
    const onGuess = (g: PublicGuess) => setFeed((f) => [...f, g].slice(-100));
    const onChat = (m: ChatMessage) =>
      setChat((c) => (c.some((x) => x.id === m.id) ? c : [...c, m].slice(-100)));
    const onHint = (h: string) => setHint(h);
    const onError = (msg: string) => setError(msg);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('guess:new', onGuess);
    socket.on('clue:hint', onHint);
    socket.on('chat:new', onChat);
    socket.on('error', onError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('guess:new', onGuess);
      socket.off('clue:hint', onHint);
      socket.off('chat:new', onChat);
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
    setChat([]);
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
  const bump = useCallback<GameClient['bump']>(() => emitAck('clue:bump'), []);
  const sendChat = useCallback<GameClient['sendChat']>(
    (text) => emitAck('clue:chat', { text }),
    [],
  );
  const skip = useCallback<GameClient['skip']>(() => emitAck('host:skip'), []);
  const next = useCallback<GameClient['next']>(() => emitAck('host:next'), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    connected,
    view,
    feed,
    chat,
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
    bump,
    sendChat,
    skip,
    next,
    clearError,
  };
}
