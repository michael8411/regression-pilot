/**
 * Phase 05 — drawer Attachments panel.
 *
 * Jira ticket payloads currently don't include an attachments field.
 * Render an explicit empty-state. Phase 06 (or a future Jira backend
 * extension) will wire actual attachment data through.
 */

import { Paperclip } from "@/lib/icons";

export function DrawerAttachmentsPanel() {
  return (
    <div
      id="drawer-panel-attachments"
      role="tabpanel"
      aria-labelledby="drawer-tab-attachments"
      className="px-4 py-8 flex flex-col items-center justify-center text-center"
    >
      <div className="w-10 h-10 rounded-lg bg-surface-overlay border border-subtle flex items-center justify-center mb-3">
        <Paperclip size={16} className="text-ink-muted" />
      </div>
      <p className="text-[12px] text-ink-secondary font-medium mb-1">
        No attachments
      </p>
      <p className="text-[11.5px] text-ink-faint max-w-[280px] leading-relaxed">
        Attachment previews aren't included in this Jira payload yet. Open
        the ticket in Jira to view files.
      </p>
    </div>
  );
}
