import { customAlphabet } from 'nanoid';

// Crockford-ish base32 without ambiguous chars (no O/0, I/1, L, U).
// 5 characters to match the design (e.g. "PARTY").
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const generate = customAlphabet(ALPHABET, 5);

/** Generate a room code; pass `isTaken` to avoid collisions with live rooms. */
export function generateRoomCode(isTaken: (code: string) => boolean): string {
  for (let i = 0; i < 20; i++) {
    const code = generate();
    if (!isTaken(code)) return code;
  }
  // Extremely unlikely; widen the space rather than loop forever.
  return generate() + generate();
}
