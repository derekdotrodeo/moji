import { describe, expect, it } from 'vitest';
import { issueSessionToken, verifySessionToken } from './session.js';

describe('session tokens', () => {
  it('round-trips a valid token', () => {
    const token = issueSessionToken('player-1', 'ABCD');
    const payload = verifySessionToken(token);
    expect(payload?.playerId).toBe('player-1');
    expect(payload?.roomCode).toBe('ABCD');
    expect(typeof payload?.iat).toBe('number');
  });

  it('rejects a tampered payload', () => {
    const token = issueSessionToken('player-1', 'ABCD');
    const [, sig] = token.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ playerId: 'attacker', roomCode: 'ABCD', iat: Date.now() }),
    ).toString('base64url');
    expect(verifySessionToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('garbage')).toBeNull();
    expect(verifySessionToken('only.two')).toBeNull();
  });
});
