/**
 * Reconnection session tokens (design doc §4). A signed, stateless token that
 * lets a returning socket rebind to its existing player slot. HMAC-signed with
 * SESSION_SECRET; no DB lookup required.
 *
 * Format: base64url(payloadJson).base64url(hmac)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

export interface SessionPayload {
  playerId: string;
  roomCode: string;
  iat: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(data: string): string {
  return b64url(createHmac('sha256', env.sessionSecret).update(data).digest());
}

export function issueSessionToken(playerId: string, roomCode: string): string {
  const payload: SessionPayload = { playerId, roomCode, iat: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
  } catch {
    return null;
  }
}
