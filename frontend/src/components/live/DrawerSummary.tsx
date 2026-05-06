import type { ReactNode } from "react";
import { Tag } from "@/lib/icons";
import type { JiraTicket } from "@/types";

export function DrawerSummary({ ticket }: { ticket: JiraTicket }) {
  return (
    <section className="px-4 py-3 border-b border-subtle text-[11.5px] text-ink-secondary">
      <dl className="grid grid-cols-[80px_1fr] gap-y-1.5">
        <Row term="Assignee">{ticket.assignee || "Unassigned"}</Row>
        <Row term="Reporter">{ticket.reporter || "Unknown"}</Row>
        <Row term="Type">{ticket.issue_type || "—"}</Row>
        <Row term="Priority">{ticket.priority || "—"}</Row>
        <Row term="Resolution">{ticket.resolution || "—"}</Row>
        {ticket.fix_versions?.length > 0 && (
          <Row term="Fix in">{ticket.fix_versions.join(", ")}</Row>
        )}
        {ticket.components?.length > 0 && (
          <Row term="Components">{ticket.components.join(", ")}</Row>
        )}
        {ticket.labels?.length > 0 && (
          <Row term="Labels">
            <div className="flex flex-wrap gap-1">
              {ticket.labels.map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] bg-surface-overlay text-ink-muted"
                >
                  <Tag size={9} /> {l}
                </span>
              ))}
            </div>
          </Row>
        )}
      </dl>
    </section>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-faint">{term}</dt>
      <dd className="text-ink min-w-0 break-words">{children}</dd>
    </>
  );
}
