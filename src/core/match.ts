// Small fuzzy subsequence matcher for the overlay's search box. No dependency is worth
// pulling in for this: every query character must appear in the target, in order but
// not necessarily adjacent, and consecutive runs plus matches at word boundaries score
// higher so e.g. "rqa" ranks "repo-quick-access" above "requiem-alpha".

export interface Searchable {
  name: string;
}

const WORD_BOUNDARY = /[\s/\\_.-]/;

/** Score for `query` as a subsequence of `target`, or `undefined` if it isn't one. */
export function fuzzyScore(query: string, target: string): number | undefined {
  if (query === "") return 0;

  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let run = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      run = 0;
      continue;
    }
    run += 1;
    score += run; // consecutive matches are worth progressively more
    if (ti === 0 || WORD_BOUNDARY.test(t[ti - 1])) score += 3;
    qi += 1;
  }

  if (qi < q.length) return undefined;
  return score - t.length * 0.01; // among equal matches, prefer the shorter target
}

/**
 * Filters and ranks `items` by their `name` fuzzy score, best match first.
 *
 * Matching only ever looks at `name`, not the full path: a subsequence match against an
 * absolute path can span unrelated segments (e.g. "rpg" matching across ".../repos/f95-
 * manager" — the "r"/"p" from "repos", the "g" from "manager"), surfacing entries the
 * query has nothing to do with.
 */
export function fuzzyFilter<T extends Searchable>(query: string, items: T[]): T[] {
  const trimmed = query.trim();
  if (trimmed === "") return items;

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = fuzzyScore(trimmed, item.name);
    if (score === undefined) continue;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
