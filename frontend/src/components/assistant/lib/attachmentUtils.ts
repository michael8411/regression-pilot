export function encodeTestCaseRef(sessionId: string, index: number): string {
  return `${sessionId}:${index}`;
}

export function decodeTestCaseRef(
  ref: string,
): { sessionId: string; index: number } | null {
  const colon = ref.indexOf(":");
  if (colon <= 0 || colon === ref.length - 1) return null;
  const sid = ref.slice(0, colon);
  const idxStr = ref.slice(colon + 1);
  if (!sid || idxStr === "") return null;
  const idx = Number(idxStr);
  if (!Number.isFinite(idx) || !Number.isInteger(idx) || idx < 0) return null;
  return { sessionId: sid, index: idx };
}

export function isLikelyJiraKey(s: string): boolean {
  return /^[A-Z][A-Z0-9]+-\d+$/.test(s.trim());
}
