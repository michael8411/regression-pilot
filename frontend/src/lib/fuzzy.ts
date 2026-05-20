/**
 * Tiny substring + subsequence scorer used by the command palette.
 * No dependency — the command list stays small enough (< 200) that a
 * dedicated fuzzy library would be overkill.
 *
 * Ranking tiers (higher is better):
 *   - exact prefix           → ~1000
 *   - substring at word-start → ~600
 *   - substring elsewhere    → ~300
 *   - subsequence fallback   → 100
 *   - no match               → 0
 */

export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t.startsWith(q)) return 1000 - q.length + (t.length - q.length) * -0.1;

  const idx = t.indexOf(q);
  if (idx > 0) {
    const atWordStart = /\s|[-_.]/.test(t[idx - 1]);
    return (atWordStart ? 600 : 300) - Math.abs(t.length - q.length);
  }

  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    const found = t.indexOf(c, ti);
    if (found < 0) return 0;
    ti = found + 1;
  }
  return 100;
}

/** Score a command against a query using label + sub + keywords. */
export function scoreCommand(
  query: string,
  cmd: { label: string; sub?: string; keywords?: string[] },
): number {
  if (!query) return 1;
  return Math.max(
    fuzzyScore(query, cmd.label) * 1.0,
    cmd.sub ? fuzzyScore(query, cmd.sub) * 0.6 : 0,
    ...(cmd.keywords ?? []).map((k) => fuzzyScore(query, k) * 0.7),
  );
}
