/**
 * Render the outcome of a publish-to-Jira attempt.
 *
 * The copy here is the source of truth for the "did this actually appear on
 * the Jira ticket?" question. Honest states:
 *
 *  1. Test Cases field OK  — "Posted to Jira Test Cases field on TICKET" (06c)
 *  2. Linked publish OK    — "Linked to Jira ticket test cases" (legacy Zephyr)
 *  3. Comment fallback OK  — "Posted as Jira comment fallback"
 *  4. Partial/failure      — show created + failed lists separately, never
 *                            imply all cases appear on the ticket.
 *
 * The panel never claims "appears on ticket" unless the backend response
 * also sets `appears_on_jira_ticket: true`.
 */

import { clsx } from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  CircleAlert,
} from "@/lib/icons";
import type {
  LivePublishCasesResponse,
  LiveCreatedTestCase,
  LiveFailedPublishCase,
  LiveJiraFieldResult,
} from "@/types/live";

interface Props {
  ticketKey: string;
  result: LivePublishCasesResponse;
  /** Caller may want to dismiss the result and return to the cases list. */
  onClose?: () => void;
}

export function PublishResultPanel({ ticketKey, result, onClose }: Props) {
  const isFieldSuccess =
    result.status === "exported" &&
    result.target === "jira_test_cases_field";
  const isLinkedSuccess =
    result.status === "exported" &&
    result.target === "zephyr_linked_tests" &&
    result.appears_on_jira_ticket;
  const isPartial = result.status === "partial_export";
  const isCommented = result.status === "commented";
  const isTotalFailure =
    !isFieldSuccess && !isLinkedSuccess && !isPartial && !isCommented;

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-elevated p-4"
    >
      <Header
        isFieldSuccess={isFieldSuccess}
        isLinkedSuccess={isLinkedSuccess}
        isPartial={isPartial}
        isCommented={isCommented}
        isTotalFailure={isTotalFailure}
        ticketKey={ticketKey}
      />

      {result.message && !isFieldSuccess && !isLinkedSuccess && (
        <p
          className={clsx(
            "text-[11.5px] leading-relaxed",
            isTotalFailure ? "text-err" : "text-ink-secondary",
          )}
        >
          {result.message}
        </p>
      )}

      {isFieldSuccess && result.jira_field && (
        <FieldResult field={result.jira_field} />
      )}

      {result.created_test_cases.length > 0 && (
        <CreatedList
          cases={result.created_test_cases}
          appearsOnTicket={result.appears_on_jira_ticket}
          ticketKey={ticketKey}
        />
      )}

      {result.failed.length > 0 && (
        <FailedList failed={result.failed} />
      )}

      {isCommented && result.jira_comment && (
        <CommentResult comment={result.jira_comment} />
      )}

      {result.duplicate_attempt && (
        <p className="text-[10.5px] text-warn">
          Duplicate publish recorded for this case set.
        </p>
      )}

      {onClose && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="g-btn text-[12px] px-3"
          >
            Close
          </button>
        </div>
      )}
    </section>
  );
}

interface HeaderProps {
  isFieldSuccess: boolean;
  isLinkedSuccess: boolean;
  isPartial: boolean;
  isCommented: boolean;
  isTotalFailure: boolean;
  ticketKey: string;
}

function Header({
  isFieldSuccess,
  isLinkedSuccess,
  isPartial,
  isCommented,
  isTotalFailure,
  ticketKey,
}: HeaderProps) {
  if (isFieldSuccess) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-ok" />
        <div>
          <h4 className="text-[12px] font-semibold text-ink">
            Posted to Jira Test Cases field on {ticketKey}
          </h4>
          <p className="text-[10.5px] text-ink-faint">
            The ticket's Test Cases field now reflects this draft.
          </p>
        </div>
      </div>
    );
  }
  if (isLinkedSuccess) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-ok" />
        <div>
          <h4 className="text-[12px] font-semibold text-ink">
            Linked to Jira ticket test cases
          </h4>
          <p className="text-[10.5px] text-ink-faint">
            These cases appear in the {ticketKey} Test Cases panel.
          </p>
        </div>
      </div>
    );
  }
  if (isCommented) {
    return (
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-info" />
        <div>
          <h4 className="text-[12px] font-semibold text-ink">
            Posted as Jira comment fallback
          </h4>
          <p className="text-[10.5px] text-ink-faint">
            The comment is on {ticketKey}. The Test Cases field was not
            updated.
          </p>
        </div>
      </div>
    );
  }
  if (isPartial) {
    return (
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-warn" />
        <div>
          <h4 className="text-[12px] font-semibold text-ink">
            Partial publish to {ticketKey}
          </h4>
          <p className="text-[10.5px] text-ink-faint">
            Some cases were created in Zephyr but at least one failed.
          </p>
        </div>
      </div>
    );
  }
  if (isTotalFailure) {
    return (
      <div className="flex items-center gap-2">
        <CircleAlert size={14} className="text-err" />
        <div>
          <h4 className="text-[12px] font-semibold text-ink">
            Publish failed
          </h4>
          <p className="text-[10.5px] text-ink-faint">
            Your draft is unchanged. You can retry below.
          </p>
        </div>
      </div>
    );
  }
  return null;
}

function CreatedList({
  cases,
  appearsOnTicket,
  ticketKey,
}: {
  cases: LiveCreatedTestCase[];
  appearsOnTicket: boolean;
  ticketKey: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h5 className="text-[10px] uppercase tracking-wider text-ink-muted font-mono">
        Created in Zephyr ({cases.length})
      </h5>
      <ul className="flex flex-col gap-1">
        {cases.map((c, i) => (
          <li
            key={(c.key || c.id || c.name) + i}
            className="flex items-center gap-2 text-[11.5px] text-ink-secondary"
          >
            <CheckCircle2 size={11} className="text-ok shrink-0" />
            <span className="truncate">
              {c.key ? (
                <span className="font-mono text-[11px]">{c.key}</span>
              ) : null}
              {c.key && c.name ? " · " : ""}
              <span>{c.name}</span>
            </span>
            {c.self_url && (
              <a
                href={c.self_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-muted hover:text-ink"
                aria-label={`Open ${c.name} in Zephyr`}
              >
                <ExternalLink size={11} />
              </a>
            )}
          </li>
        ))}
      </ul>
      {!appearsOnTicket && (
        <p className="text-[10.5px] text-warn">
          These cases were created in Zephyr but linking to {ticketKey} failed.
          They may not appear in the Test Cases panel.
        </p>
      )}
    </div>
  );
}

function FailedList({ failed }: { failed: LiveFailedPublishCase[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h5 className="text-[10px] uppercase tracking-wider text-ink-muted font-mono">
        Failed ({failed.length})
      </h5>
      <ul className="flex flex-col gap-1">
        {failed.map((f, i) => (
          <li
            key={f.name + i}
            className="flex items-start gap-2 text-[11.5px] text-ink-secondary"
          >
            <CircleAlert size={11} className="text-err shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="truncate">{f.name}</div>
              <div className="text-[10.5px] text-ink-faint truncate">
                {f.error}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldResult({ field }: { field: LiveJiraFieldResult }) {
  return (
    <div className="rounded-md border border-subtle bg-surface-overlay/50 px-3 py-2 text-[11px] text-ink-secondary">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={11} className="text-ok" />
        <span className="font-mono">{field.field_id}</span>
        <span className="text-ink-faint">on</span>
        <span className="font-mono">{field.ticket_key}</span>
      </div>
      {field.updated_at && (
        <div className="text-[10px] text-ink-faint font-mono mt-0.5">
          updated {field.updated_at}
        </div>
      )}
    </div>
  );
}

function CommentResult({
  comment,
}: {
  comment: NonNullable<LivePublishCasesResponse["jira_comment"]>;
}) {
  return (
    <div className="rounded-md border border-subtle bg-surface-overlay/50 px-3 py-2 text-[11px] text-ink-secondary">
      <div className="flex items-center gap-2">
        <MessageSquare size={11} className="text-info" />
        <span className="font-mono">comment {comment.id}</span>
        {comment.url && (
          <a
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-ink-muted hover:text-ink"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>
      {comment.created && (
        <div className="text-[10px] text-ink-faint font-mono mt-0.5">
          posted {comment.created}
        </div>
      )}
    </div>
  );
}
