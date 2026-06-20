/**
 * Guess-matching engine (design doc §7). Normalizes a guess and accepts it if
 * it matches any accepted answer exactly or within a small edit distance (to
 * tolerate typos), while rejecting near-misses flagged as blocklisted.
 *
 * Lives behind a simple function so it can be swapped/tuned with a fixture
 * test suite without touching game flow.
 */

export interface AnswerSpec {
  /** accepted texts (canonical + aliases) */
  accepted: string[];
  /** texts that must NOT be accepted even if close (e.g. confusable titles) */
  blocklist?: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/\b(the|a|an|of|and)\b/g, ' ') // drop common articles/conjunctions
    .replace(/[^a-z0-9]+/g, ' ') // punctuation -> space
    .trim()
    .replace(/\s+/g, ' ');
}

/** Levenshtein distance (small strings, fine to compute directly). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/**
 * Edit-distance tolerance scaled to answer length. Kept conservative: short
 * answers must be exact, mid-length allow a single typo, only long titles allow
 * two. This is typo-forgiveness, NOT partial-credit — a guess must still be
 * close to the WHOLE answer (or a curated alias), so "mario" never matches
 * "super mario bros".
 */
function tolerance(len: number): number {
  if (len <= 5) return 0;
  if (len <= 12) return 1;
  return 2;
}

export function isCorrectGuess(guess: string, spec: AnswerSpec): boolean {
  const g = normalize(guess);
  if (!g) return false;

  for (const bad of spec.blocklist ?? []) {
    if (normalize(bad) === g) return false;
  }
  for (const ans of spec.accepted) {
    const a = normalize(ans);
    if (!a) continue;
    if (a === g) return true;
    if (editDistance(a, g) <= tolerance(a.length)) return true;
  }
  return false;
}
