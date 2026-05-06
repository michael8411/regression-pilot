import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Pin, PinOff, X } from "@/lib/icons";
import { getConfigStatus } from "@/lib/api";
import type { JiraTicket } from "@/types";
import { buildTicketUrl, openExternal } from "./lib/jiraLinks";

interface Props {
  ticketKey: string;
  ticket: JiraTicket | null;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
}

export function DrawerHeader({
  ticketKey,
  ticket,
  isPinned,
  onTogglePin,
  onClose,
}: Props) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getConfigStatus();
        if (!cancelled) setBaseUrl(cfg.jira.base_url ?? null);
      } catch {
        if (!cancelled) setBaseUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const url = buildTicketUrl(baseUrl, ticketKey);

  return (
    <header className="px-4 py-3 border-b border-subtle">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11.5px] text-accent-text">
              {ticketKey}
            </span>
            {ticket?.status && (
              <span className="px-1.5 py-0.5 rounded bg-surface-overlay text-[10px] text-ink-muted">
                {ticket.status}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-[14px] font-semibold text-ink leading-snug">
            {ticket?.summary ?? "—"}
          </h2>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn
            label={isPinned ? "Unpin" : "Pin"}
            onClick={onTogglePin}
          >
            {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
          </IconBtn>
          {url && (
            <IconBtn
              label="Open in Jira"
              onClick={() => void openExternal(url)}
            >
              <ExternalLink size={12} />
            </IconBtn>
          )}
          <IconBtn label="Close" onClick={onClose}>
            <X size={12} />
          </IconBtn>
        </div>
      </div>
    </header>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="w-7 h-7 rounded-md flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {children}
    </button>
  );
}
