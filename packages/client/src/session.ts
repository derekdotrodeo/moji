/**
 * Local persistence for resuming a room across reloads: the signed reconnection
 * token plus the player's chosen name/avatar (so a refresh can rejoin silently).
 */
const TOKEN = 'moji.sessionToken';
const NAME = 'moji.name';
const AVATAR = 'moji.avatar';

export function saveSession(token: string, name: string, avatar: string): void {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(NAME, name);
  localStorage.setItem(AVATAR, avatar);
}

/** Clear the token (so we don't auto-rejoin) but keep name/avatar for prefill. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN);
}

export function getToken(): string | undefined {
  return localStorage.getItem(TOKEN) ?? undefined;
}

export function getStoredName(): string {
  return localStorage.getItem(NAME) ?? '';
}

export function getStoredAvatar(): string {
  return localStorage.getItem(AVATAR) ?? '😎';
}

/** Read the room code embedded in the (unencrypted, signed) token payload. */
export function tokenRoomCode(): string | null {
  const token = getToken();
  if (!token) return null;
  const body = token.split('.')[0];
  if (!body) return null;
  try {
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as { roomCode?: string };
    return typeof payload.roomCode === 'string' ? payload.roomCode : null;
  } catch {
    return null;
  }
}
