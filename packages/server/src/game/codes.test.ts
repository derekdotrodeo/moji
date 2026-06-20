import { describe, expect, it } from 'vitest';
import { generateRoomCode } from './codes.js';

describe('generateRoomCode', () => {
  it('produces a 5-char code from the unambiguous alphabet', () => {
    const code = generateRoomCode(() => false);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}$/); // no 0/1/O/I/L/U
  });

  it('avoids codes already taken', () => {
    const taken = new Set<string>();
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode((c) => taken.has(c));
      expect(taken.has(code)).toBe(false);
      taken.add(code);
      codes.add(code);
    }
    expect(codes.size).toBe(50);
  });

  it('still returns a code even if the first candidates collide', () => {
    let calls = 0;
    // First 5 candidates are "taken", then accept.
    const code = generateRoomCode(() => calls++ < 5);
    expect(code.length).toBeGreaterThanOrEqual(5);
  });
});
