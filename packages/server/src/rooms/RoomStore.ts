/**
 * RoomStore seam (design doc §4 / Appendix B). The only hard scaling change is
 * where live room state lives. For the MVP it's in process memory; later this
 * same interface gets a Redis-backed implementation (authoritative snapshot +
 * per-room lock) without touching game logic.
 */
import type { Room } from './Room.js';

export interface RoomStore {
  get(code: string): Room | undefined;
  has(code: string): boolean;
  set(room: Room): void;
  delete(code: string): void;
  codes(): string[];
  count(): number;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }
  has(code: string): boolean {
    return this.rooms.has(code);
  }
  set(room: Room): void {
    this.rooms.set(room.code, room);
  }
  delete(code: string): void {
    this.rooms.delete(code);
  }
  codes(): string[] {
    return [...this.rooms.keys()];
  }
  count(): number {
    return this.rooms.size;
  }
}
