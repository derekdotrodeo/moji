import { describe, expect, it } from 'vitest';
import { RoomManager } from './RoomManager.js';
import { InMemoryRoomStore } from './RoomStore.js';
import type { Broadcaster } from '../realtime/Broadcaster.js';
import type { ContentProvider } from '../content/ContentProvider.js';

const noopBroadcaster = { toSocket() {}, toRoom() {} } as unknown as Broadcaster;
const fakeContent = { packs: () => [] } as unknown as ContentProvider;

const newManager = () =>
  new RoomManager(new InMemoryRoomStore(), noopBroadcaster, fakeContent, async () => {});

describe('RoomManager: reconnection vs. create', () => {
  it('creating (no code) with a stale token starts a NEW room, not the old one', () => {
    const mgr = newManager();
    const first = mgr.join('sock1', { displayName: 'Alice' });
    // Same player returns holding their token but CREATES a new room (no code).
    const second = mgr.join('sock2', {
      displayName: 'Alice',
      sessionToken: first.sessionToken,
    });
    expect(second.room.code).not.toBe(first.room.code);
    expect(second.playerId).not.toBe(first.playerId);
  });

  it('re-entering the SAME code with a token reconnects to the same slot', () => {
    const mgr = newManager();
    const first = mgr.join('sock1', { displayName: 'Alice' });
    const rejoin = mgr.join('sock2', {
      displayName: 'Alice',
      code: first.room.code,
      sessionToken: first.sessionToken,
    });
    expect(rejoin.room.code).toBe(first.room.code);
    expect(rejoin.playerId).toBe(first.playerId); // same player slot resumed
  });

  it('joining a DIFFERENT code with a token joins as a new player', () => {
    const mgr = newManager();
    const a = mgr.join('s1', { displayName: 'Alice' });
    const bHost = mgr.join('s2', { displayName: 'Bob' });
    const aInB = mgr.join('s3', {
      displayName: 'Alice',
      code: bHost.room.code,
      sessionToken: a.sessionToken,
    });
    expect(aInB.room.code).toBe(bHost.room.code);
    expect(aInB.playerId).not.toBe(a.playerId);
  });
});
