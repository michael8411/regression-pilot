import { useEffect, useMemo, useState } from "react";
import type { Attachment } from "@/types/conversations";
import { decodeTestCaseRef } from "@/components/assistant/lib/attachmentUtils";
import { listSessions } from "@/lib/api";

export interface ResolvedInfo {
  label?: string;
  stale?: boolean;
}

export function useResolvedAttachments(
  attachments: Attachment[],
): Map<string, ResolvedInfo> {
  const [sessionLabels, setSessionLabels] = useState<
    Map<string, string | null>
  >(new Map());

  const sessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of attachments) {
      if (a.kind === "session_ref") ids.add(a.ref);
      if (a.kind === "test_case") {
        const r = decodeTestCaseRef(a.ref);
        if (r) ids.add(r.sessionId);
      }
    }
    return Array.from(ids).sort();
  }, [attachments]);

  const cacheKey = sessionIds.join("|");

  useEffect(() => {
    let cancelled = false;
    if (sessionIds.length === 0) {
      setSessionLabels(new Map());
      return;
    }
    (async () => {
      try {
        const all = await listSessions();
        if (cancelled) return;
        const map = new Map<string, string | null>();
        for (const id of sessionIds) {
          const s = all.find((x: any) => x.id === id);
          map.set(
            id,
            s ? `${s.project_key} ${s.version_name ?? ""}`.trim() : null,
          );
        }
        setSessionLabels(map);
      } catch {
        if (cancelled) return;
        setSessionLabels(new Map(sessionIds.map((id) => [id, null])));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return useMemo(() => {
    const out = new Map<string, ResolvedInfo>();
    for (const a of attachments) {
      if (a.kind === "ticket") {
        out.set(a.id, { label: a.ref });
        continue;
      }
      if (a.kind === "session_ref") {
        const label = sessionLabels.get(a.ref);
        if (label === null)
          out.set(a.id, { stale: true, label: "Deleted session" });
        else if (label) out.set(a.id, { label });
        else out.set(a.id, { label: "Session" });
        continue;
      }
      if (a.kind === "test_case") {
        const decoded = decodeTestCaseRef(a.ref);
        if (!decoded) {
          out.set(a.id, { stale: true, label: "Invalid ref" });
          continue;
        }
        const sl = sessionLabels.get(decoded.sessionId);
        if (sl === null) {
          out.set(a.id, { stale: true, label: "Deleted session" });
        } else {
          out.set(a.id, { label: `Test #${decoded.index + 1}` });
        }
      }
    }
    return out;
  }, [attachments, sessionLabels]);
}
