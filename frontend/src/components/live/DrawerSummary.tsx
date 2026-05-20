/**
 * Phase 05 — drawer ticket metadata grid.
 *
 * Embedded inside the Description tab now (not at the drawer root) so the
 * tab IA stays clean. Labels still render as <LabelChip> for consistency
 * with the rest of the Live surfaces.
 */

import type { ReactNode } from "react";
import { LabelChip } from "@/components/live/visual";
import type { JiraTicket } from "@/types";

export function DrawerSummary({ ticket }: { ticket: JiraTicket }) {
  return (
    <section className="text-[11.5px] text-ink-secondary">
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
                <LabelChip key={l} label={l} />
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
