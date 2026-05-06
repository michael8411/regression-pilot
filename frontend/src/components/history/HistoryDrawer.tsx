import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";
import { IconButton } from "@/components/ui";
import { useRoute } from "@/contexts/RouteContext";
import { useSession } from "@/hooks/useSession";
import { listSessions, activateSession, deleteSession } from "@/lib/api";
import type { Session } from "@/types";
import { SessionList } from "./SessionList";
import { SessionDetail } from "./SessionDetail";
import { SessionSearch } from "./SessionSearch";
import { type HistoryFilter, matchesFilter, matchesSearch, routeForSession } from "./historyUtils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HistoryDrawer({ open, onClose }: Props) {
  const { goto } = useRoute();
  const { sessionId: activeId, refreshActiveSession } = useSession();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await listSessions();
      const sorted = [...s].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      setSessions(sorted);
      setSelectedId((prev) => {
        if (prev && sorted.some((x) => x.id === prev)) return prev;
        const initial = sorted.find((x) => x.id === activeId) ?? sorted[0];
        return initial?.id ?? null;
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchSessions();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const filtered = useMemo(
    () => sessions.filter((s) => matchesFilter(s, filter) && matchesSearch(s, query)),
    [sessions, filter, query],
  );

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  const handleRestore = async (s: Session) => {
    setBusy(true);
    setError(null);
    try {
      await activateSession(s.id);
      await refreshActiveSession();
      goto(routeForSession(s));
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't restore session");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (s: Session) => {
    const ok = window.confirm(
      `Delete this saved session for ${s.project_key} ${s.version_name ?? ""}?\n\nThis can't be undone.`,
    );
    if (!ok) return;

    if (s.id === activeId) {
      const reallyOk = window.confirm(
        "This is your active session. Deleting it will start you fresh on the home screen. Continue?",
      );
      if (!reallyOk) return;
    }

    setBusy(true);
    setError(null);
    try {
      await deleteSession(s.id);
      const next = sessions.filter((x) => x.id !== s.id);
      setSessions(next);
      if (s.id === activeId) {
        await refreshActiveSession();
        goto(["regression", "home"]);
      }
      if (selectedId === s.id) {
        setSelectedId(next[0]?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Couldn't delete session");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[8000] bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Session history"
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 w-[480px] max-w-[100vw] z-[8001] surface-elevated border-l border-subtle shadow-float flex flex-col animate-slide-in-right"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
          <h2 className="t-title text-ink">History</h2>
          <IconButton
            size="sm"
            aria-label="Close history"
            icon={<X size={14} />}
            onClick={onClose}
          />
        </header>

        <SessionSearch
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
        />

        <div className="flex-1 overflow-hidden flex flex-col">
          <SessionList
            sessions={filtered}
            loading={loading}
            error={error}
            activeId={activeId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRetry={() => setReloadKey((k) => k + 1)}
          />

          <SessionDetail
            session={selected}
            isActive={selected?.id === activeId}
            busy={busy}
            onRestore={handleRestore}
            onDelete={handleDelete}
          />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
