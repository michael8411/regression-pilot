import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "@/lib/icons";

interface Props {
  /** Currently effective JQL (custom value if `customJql` else auto-generated). */
  effectiveJql: string;
  /** Auto-generated JQL from the simple draft — used by the reset action. */
  autoJql: string;
  customJql: boolean;
  onChange: (next: { jql: string; customJql: boolean }) => void;
  defaultOpen?: boolean;
}

export function AdvancedJqlSection({
  effectiveJql,
  autoJql,
  customJql,
  onChange,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-md border border-subtle bg-surface-overlay/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-ink"
      >
        <span className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown size={12} className="text-ink-muted" />
          ) : (
            <ChevronRight size={12} className="text-ink-muted" />
          )}
          <span className="font-medium">Advanced · raw JQL</span>
          {customJql && (
            <span className="ml-1 text-[10px] rounded-full px-1.5 py-0.5 bg-warn/10 text-warn border border-warn/30">
              custom
            </span>
          )}
        </span>
        <span className="text-[10.5px] text-ink-faint">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {customJql && (
            <div className="rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 flex items-start justify-between gap-2">
              <p className="text-[11px] text-ink-secondary leading-snug">
                Using custom JQL. The simple builder won't drive this query
                until you reset it.
              </p>
              <button
                type="button"
                onClick={() =>
                  onChange({ jql: autoJql, customJql: false })
                }
                className="flex items-center gap-1 text-[11px] text-ink hover:text-accent-text whitespace-nowrap"
                title="Reset to auto-generated JQL"
              >
                <RotateCcw size={11} />
                Reset
              </button>
            </div>
          )}
          <textarea
            value={effectiveJql}
            onChange={(e) =>
              onChange({ jql: e.target.value, customJql: true })
            }
            rows={4}
            spellCheck={false}
            className="g-input w-full text-[12px] font-mono resize-y"
            placeholder='project = FM AND status in ("In Progress", "Ready for QA") ORDER BY updated DESC'
          />
          <p className="text-[10.5px] text-ink-faint">
            Optional. Edit only if you need filters the simple form does not
            cover (sprint, parent, custom fields).
          </p>
        </div>
      )}
    </section>
  );
}
