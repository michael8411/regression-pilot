import type { StepId, StepState } from "../hooks/useWizard";
import { Check } from "@/lib/icons";
import { cn } from "@/lib/cn";

const ITEMS: { id: StepId; label: string }[] = [
  { id: "welcome",     label: "Welcome"     },
  { id: "jira",        label: "Jira"        },
  { id: "gemini",      label: "Gemini"      },
  { id: "zephyr",      label: "Zephyr"      },
  { id: "preferences", label: "Preferences" },
];

interface Props {
  current: StepId;
  steps: Record<StepId, StepState>;
}

export function ProgressRail({ current, steps }: Props) {
  return (
    <aside className="w-[220px] shrink-0 bg-surface border-r border-subtle px-5 py-6">
      <div className="t-label text-ink-muted mb-4">Setup</div>
      <ol className="space-y-2">
        {ITEMS.map((it, i) => {
          const isCurrent = it.id === current;
          const isDone = steps[it.id]?.complete && !isCurrent;
          return (
            <li key={it.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full text-[11px] tabular-nums shrink-0",
                  isDone
                    ? "bg-ok text-white"
                    : isCurrent
                      ? "bg-accent text-white"
                      : "bg-surface-overlay text-ink-muted",
                )}
                aria-hidden
              >
                {isDone ? <Check size={12} /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  isCurrent ? "text-ink font-medium" : "text-ink-muted",
                )}
              >
                {it.label}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
