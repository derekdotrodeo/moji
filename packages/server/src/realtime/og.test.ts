import { describe, expect, it } from 'vitest';
import { escapeAttr, landingMeta, normalizeRoomCode, renderShell, roomMeta } from './og.js';

/** A trimmed stand-in for the built index.html, with the tags in the real order. */
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Moji — Emoji Clue Party Game</title>
    <meta name="description" content="original description" />
    <meta property="og:title" content="original title" />
    <meta property="og:description" content="original og description" />
    <meta property="og:url" content="https://moji.derek.rodeo/" />
    <meta property="og:image" content="https://moji.derek.rodeo/og.png" />
  </head>
  <body><div id="root"></div></body>
</html>`;

const ORIGIN = 'https://moji.derek.rodeo';

describe('normalizeRoomCode', () => {
  it('upper-cases a code typed in lower case', () => {
    expect(normalizeRoomCode('kcbx8')).toBe('KCBX8');
  });

  it('strips anything outside the room-code alphabet', () => {
    // The value is echoed into HTML we serve, so it is filtered down to the
    // alphabet rather than merely escaped. Letters that happen to be in the
    // alphabet survive — what must not survive is anything else.
    const ALLOWED = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]*$/;
    for (const hostile of ['AB<script>CD', '../../etc/passwd', 'a"b\'c', 'KC%20BX8', 'KC/BX8']) {
      const out = normalizeRoomCode(hostile);
      expect(out, hostile).toMatch(ALLOWED);
    }
    expect(normalizeRoomCode('AB<script>CD')).not.toContain('<');
    expect(normalizeRoomCode('../../etc/passwd')).not.toContain('/');
  });

  it('drops the ambiguous characters the generator never emits', () => {
    expect(normalizeRoomCode('OIL01U')).toBe('');
  });

  it('caps the length so a long path cannot pad the card', () => {
    expect(normalizeRoomCode('A'.repeat(500)).length).toBe(10);
  });
});

describe('roomMeta', () => {
  it('puts the live player count in the description', () => {
    const meta = roomMeta(ORIGIN, 'KCBX8', 4);
    expect(meta.title).toBe('Join room KCBX8 on Moji');
    expect(meta.description).toContain('4 players waiting');
    expect(meta.url).toBe('https://moji.derek.rodeo/r/KCBX8');
  });

  it('says "1 player" rather than "1 players"', () => {
    expect(roomMeta(ORIGIN, 'KCBX8', 1).description).toContain('1 player waiting.');
    expect(roomMeta(ORIGIN, 'KCBX8', 1).description).not.toContain('1 players');
  });

  it('falls back to the generic card for a room that is not live', () => {
    // An expired or mistyped code should not advertise a room nobody can join.
    const meta = roomMeta(ORIGIN, 'KCBX8', null);
    expect(meta.title).toBe('Moji — the emoji party game');
    expect(meta.description).not.toContain('waiting');
    expect(meta.url).toBe('https://moji.derek.rodeo/r/KCBX8');
  });

  it('reports an empty lobby honestly rather than hiding it', () => {
    expect(roomMeta(ORIGIN, 'KCBX8', 0).description).toContain('0 players waiting');
  });

  it('tolerates a trailing slash on the configured origin', () => {
    expect(roomMeta('https://moji.derek.rodeo/', 'KCBX8', 2).url).toBe(
      'https://moji.derek.rodeo/r/KCBX8',
    );
    expect(landingMeta('https://moji.derek.rodeo/').image).toBe(
      'https://moji.derek.rodeo/og.png',
    );
  });

  it('follows the deployment origin, so a domain move needs no code change', () => {
    const meta = roomMeta('https://mojiparty.com', 'KCBX8', 3);
    expect(meta.url).toBe('https://mojiparty.com/r/KCBX8');
    expect(meta.image).toBe('https://mojiparty.com/og.png');
  });
});

describe('renderShell', () => {
  it('rewrites the title and every og tag', () => {
    const html = renderShell(SHELL, roomMeta(ORIGIN, 'KCBX8', 4));
    expect(html).toContain('<title>Join room KCBX8 on Moji</title>');
    expect(html).toContain('<meta property="og:title" content="Join room KCBX8 on Moji" />');
    expect(html).toContain('content="4 players waiting. Explain a movie in ten emoji — go join them."');
    expect(html).toContain('<meta property="og:url" content="https://moji.derek.rodeo/r/KCBX8" />');
    expect(html).not.toContain('original title');
    expect(html).not.toContain('original description');
  });

  it('keeps the search description separate from the card description', () => {
    // A chat card wants a punchy line; a search result wants the words people
    // type. Collapsing them into one costs whichever job loses.
    const html = renderShell(SHELL, roomMeta(ORIGIN, 'KCBX8', 4));
    expect(html).toContain('<meta property="og:description" content="4 players waiting.');
    expect(html).toContain('free browser party game for 4-10 players');
    expect(html).not.toContain('<meta name="description" content="4 players waiting');
  });

  it('leaves the app shell itself untouched', () => {
    const html = renderShell(SHELL, roomMeta(ORIGIN, 'KCBX8', 4));
    expect(html).toContain('<div id="root"></div>');
  });

  it('adds a tag the shell is missing instead of silently dropping it', () => {
    // A silent no-op here is invisible everywhere except "paste the link into
    // Discord and look at it", which is why this injects rather than skips.
    const bare = '<html><head><title>x</title></head><body></body></html>';
    const html = renderShell(bare, landingMeta(ORIGIN));
    expect(html).toContain('property="og:image"');
    expect(html).toContain('https://moji.derek.rodeo/og.png');
    expect(html).toContain('name="description"');
  });

  it('escapes values so nothing can break out of the attribute', () => {
    const html = renderShell(SHELL, {
      title: 'Bad " onload="alert(1)',
      description: 'a & b < c',
      url: `${ORIGIN}/`,
      image: `${ORIGIN}/og.png`,
    });
    expect(html).toContain('content="Bad &quot; onload=&quot;alert(1)"');
    expect(html).toContain('a &amp; b &lt; c');
    expect(html).not.toContain('onload="alert(1)"');
  });

  it('escapes the title in element text as well as in attributes', () => {
    const html = renderShell(SHELL, { ...landingMeta(ORIGIN), title: '</title><script>x' });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;x');
  });
});

describe('escapeAttr', () => {
  it('covers the five characters that matter in an attribute', () => {
    expect(escapeAttr(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
