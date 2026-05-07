import { useMemo } from "react";
import { Plus, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui";
import type { ThemeSpec } from "@/types/cycles";

let _idCounter = 0;
function nextThemeId(): string {
  _idCounter += 1;
  return `t_${Date.now().toString(36)}_${_idCounter}`;
}

interface Props {
  value: ThemeSpec[];
  /** Tickets currently in the cycle — themes can only reference these. */
  availableKeys: string[];
  onChange: (next: ThemeSpec[]) => void;
}

export function CycleThemeEditor({
  value,
  availableKeys,
  onChange,
}: Props) {
  const availableSet = useMemo(() => new Set(availableKeys), [availableKeys]);

  // Drop ticket keys that no longer exist in the parent cycle.
  const sanitized = useMemo<ThemeSpec[]>(() => {
    const filtered = value.map((t) => ({
      ...t,
      ticketKeys: t.ticketKeys.filter((k) => availableSet.has(k)),
    }));
    const changed = filtered.some(
      (t, i) => t.ticketKeys.length !== value[i]?.ticketKeys.length,
    );
    if (changed) {
      // Defer to avoid setState-during-render warnings.
      queueMicrotask(() => onChange(filtered));
    }
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, availableSet]);

  const updateTheme = (id: string, patch: Partial<ThemeSpec>) => {
    onChange(sanitized.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const toggleTicket = (id: string, key: string) => {
    onChange(
      sanitized.map((t) =>
        t.id === id
          ? {
              ...t,
              ticketKeys: t.ticketKeys.includes(key)
                ? t.ticketKeys.filter((k) => k !== key)
                : [...t.ticketKeys, key],
            }
          : t,
      ),
    );
  };

  const addTheme = () => {
    onChange([
      ...sanitized,
      {
        id: nextThemeId(),
        label: `Theme ${sanitized.length + 1}`,
        ticketKeys: [],
      },
    ]);
  };

  const removeTheme = (id: string) => {
    onChange(sanitized.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-medium text-ink">Themes</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={addTheme}
          leading={<Plus size={12} />}
        >
          Add theme
        </Button>
      </div>
      {sanitized.length === 0 && (
        <p className="text-[11px] text-ink-faint">
          No themes. The cycle will run with all tickets in a single bucket.
        </p>
      )}
      {sanitized.map((t) => (
        <div
          key={t.id}
          className="rounded-md border border-subtle bg-surface px-2.5 py-2"
        >
          <div className="flex items-center gap-2">
            <input
              value={t.label}
              onChange={(e) => updateTheme(t.id, { label: e.target.value })}
              placeholder="Theme name"
              className="g-input text-[12px] flex-1"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeTheme(t.id)}
              aria-label={`Remove ${t.label}`}
              title="Remove theme"
            >
              <Trash2 size={12} />
            </Button>
          </div>
          {availableKeys.length === 0 ? (
            <p className="mt-1 text-[10.5px] text-ink-faint">
              Add tickets above before assigning them to themes.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1">
              {availableKeys.map((k) => {
                const on = t.ticketKeys.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleTicket(t.id, k)}
                    className={
                      on
                        ? "rounded-md border border-accent/30 bg-accent-dim px-1.5 py-0.5 text-[10.5px] font-mono text-accent-text"
                        : "rounded-md border border-subtle bg-surface px-1.5 py-0.5 text-[10.5px] font-mono text-ink-muted hover:text-ink"
                    }
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-1 text-[10.5px] text-ink-faint">
            {t.ticketKeys.length}{" "}
            {t.ticketKeys.length === 1 ? "ticket" : "tickets"} in this theme
          </div>
        </div>
      ))}
    </div>
  );
}
