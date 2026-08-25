/**
 * Link-preview (Open Graph) tags for the HTML shell.
 *
 * Moji spreads one way: someone pastes a room link into a group chat. That
 * link is the game's only marketing surface, so what a chat client renders for
 * it matters as much as anything in the app. A bare URL is a bare URL; a card
 * that says "4 players waiting" is a social obligation.
 *
 * Kept as a pure function over the shell string so the tag rewriting can be
 * tested without a server, an HTML parser, or a running room.
 */

/** Everything a crawler needs from a page. All URLs absolute — crawlers require it. */
export interface PageMeta {
  title: string;
  /** og:description — the line a chat client puts under the card. Short and punchy. */
  description: string;
  /**
   * <meta name="description"> — the line a search engine shows. Longer, and
   * carrying the words people actually search for. Falls back to `description`.
   * These are two different jobs and collapsing them costs one of them.
   */
  searchDescription?: string;
  url: string;
  image: string;
}

const DEFAULT_TITLE = 'Moji — the emoji party game';
const DEFAULT_DESCRIPTION =
  'Explain a movie in ten emoji. Your friends get thirty seconds. Good luck.';
const SEARCH_DESCRIPTION =
  'Explain a movie in ten emoji. Your friends get thirty seconds. A free browser ' +
  'party game for 4-10 players — no app, no signup, just a room code.';

/** Room codes are Crockford-ish base32 (see game/codes.ts); anything else is noise. */
const CODE_CHARS = /[^23456789ABCDEFGHJKMNPQRSTVWXYZ]/g;
const MAX_CODE_LEN = 10;

/** Escape a value for use inside a double-quoted HTML attribute. */
export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a value for use in element text (the <title>). */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Normalize a code from the URL. This value ends up inside the HTML we serve,
 * so it is filtered down to the code alphabet rather than merely escaped —
 * a crawler should never be able to make us echo its own string back.
 */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(CODE_CHARS, '').slice(0, MAX_CODE_LEN);
}

function origin(publicOrigin: string): string {
  return publicOrigin.replace(/\/+$/, '');
}

export function landingMeta(publicOrigin: string): PageMeta {
  const base = origin(publicOrigin);
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    searchDescription: SEARCH_DESCRIPTION,
    url: `${base}/`,
    image: `${base}/og.png`,
  };
}

/**
 * The card for a room link. `playerCount` is null when the room isn't live —
 * an expired or mistyped code falls back to the generic card rather than
 * advertising a room nobody can join.
 */
export function roomMeta(
  publicOrigin: string,
  code: string,
  playerCount: number | null,
): PageMeta {
  const base = origin(publicOrigin);
  const generic = landingMeta(publicOrigin);
  if (playerCount === null) return { ...generic, url: `${base}/r/${code}` };

  const waiting =
    playerCount === 1 ? '1 player waiting.' : `${playerCount} players waiting.`;
  return {
    title: `Join room ${code} on Moji`,
    description: `${waiting} Explain a movie in ten emoji — go join them.`,
    // Rooms are ephemeral and shouldn't be indexed, so search gets the generic
    // line rather than a player count that will be stale by the time it crawls.
    searchDescription: SEARCH_DESCRIPTION,
    url: `${base}/r/${code}`,
    image: `${base}/og.png`,
  };
}

/**
 * Replace a meta tag's content, or add the tag if the shell doesn't have it.
 * Injecting rather than no-op'ing matters: a silent miss here is invisible in
 * every test except "paste the link into Discord and look at it".
 */
function setMeta(html: string, attr: 'property' | 'name', key: string, value: string): string {
  const escaped = escapeAttr(value);
  const tag = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
  if (tag.test(html)) return html.replace(tag, `$1${escaped}$2`);
  return html.replace(
    /<\/head>/i,
    `  <meta ${attr}="${key}" content="${escaped}" />\n  </head>`,
  );
}

/** Stamp `meta` into the built index.html shell. */
export function renderShell(shell: string, meta: PageMeta): string {
  let html = shell.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeText(meta.title)}</title>`,
  );
  html = setMeta(html, 'name', 'description', meta.searchDescription ?? meta.description);
  html = setMeta(html, 'property', 'og:title', meta.title);
  html = setMeta(html, 'property', 'og:description', meta.description);
  html = setMeta(html, 'property', 'og:url', meta.url);
  html = setMeta(html, 'property', 'og:image', meta.image);
  return html;
}
