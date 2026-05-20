import { clsx } from "clsx";
import { AlertTriangle, ExternalLink, GitPullRequest, Info } from "@/lib/icons";
import type { JiraTicket, LinkedPullRequest } from "@/types";

const PROVIDER_LABEL: Record<string, string> = {
  github: "GitHub",
  ado: "Azure DevOps",
  unknown: "Unknown",
};

const PROVIDER_BG: Record<string, string> = {
  github: "#8B5CF622",
  ado: "#0078D422",
  unknown: "#6B728022",
};

const PROVIDER_COLOR: Record<string, string> = {
  github: "#8B5CF6",
  ado: "#0078D4",
  unknown: "#6B7280",
};

const STATE_LABEL: Record<string, string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
  unknown: "Unknown",
};

const STATE_CLASS: Record<string, string> = {
  open: "text-success",
  merged: "text-accent-text",
  closed: "text-ink-muted",
  unknown: "text-ink-muted",
};

interface Props {
  ticket: JiraTicket;
}

export function DrawerPullRequestsPanel({ ticket }: Props) {
  const prs = ticket.pull_requests ?? [];
  const error = ticket.development_links_error;
  const rawLinks = ticket.development_links ?? [];
  const unparseable = !error && prs.length === 0 && rawLinks.length > 0;

  let warningMessage: string | null = null;
  if (error) {
    warningMessage = "Jira Development links could not be loaded. Testdeck will use ticket-only context.";
  } else if (unparseable) {
    warningMessage = "Development links found but no GitHub or Azure DevOps PR URL was recognized.";
  }

  return (
    <div className="border-t border-subtle px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2">
        Linked Pull Requests
      </div>

      {warningMessage && (
        <div className="flex gap-2 items-start rounded-md border border-warn/20 bg-warn/5 px-3 py-2 mb-2">
          <AlertTriangle size={12} className="text-warn mt-0.5 shrink-0" />
          <span className="text-[11.5px] text-ink-secondary leading-snug">
            {warningMessage}
          </span>
        </div>
      )}

      {!warningMessage && prs.length === 0 && (
        <div className="flex gap-1.5 items-center text-[11.5px] text-ink-muted py-0.5">
          <Info size={12} className="shrink-0" />
          No linked PRs found in Jira Development.
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {prs.map((pr) => (
          <PRRow key={pr.id} pr={pr} />
        ))}
      </div>
    </div>
  );
}

function PRRow({ pr }: { pr: LinkedPullRequest }) {
  const title = pr.title || (pr.number != null ? `PR #${pr.number}` : pr.url);

  return (
    <div className="flex items-start gap-2 py-2 border-b border-subtle last:border-b-0">
      <GitPullRequest size={12} className="text-ink-muted mt-0.5 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold"
            style={{
              background: PROVIDER_BG[pr.provider] ?? PROVIDER_BG.unknown,
              color: PROVIDER_COLOR[pr.provider] ?? PROVIDER_COLOR.unknown,
            }}
          >
            {PROVIDER_LABEL[pr.provider] ?? pr.provider}
          </span>
          <span
            className={clsx(
              "text-[10px] font-medium",
              STATE_CLASS[pr.state] ?? "text-ink-muted",
            )}
          >
            {STATE_LABEL[pr.state] ?? pr.state}
          </span>
        </div>
        <div className="text-[11.5px] text-ink truncate">{title}</div>
        {pr.repository && (
          <div className="text-[10.5px] text-ink-muted truncate">
            {pr.repository}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.open(pr.url, "_blank", "noopener,noreferrer")}
        className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] text-ink-secondary border border-subtle hover:bg-surface-hover transition-colors"
        aria-label={`Open ${title}`}
      >
        <ExternalLink size={9} />
        Open
      </button>
    </div>
  );
}
