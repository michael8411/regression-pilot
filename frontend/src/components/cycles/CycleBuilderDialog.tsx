import { useEffect, useMemo, useState } from "react";
import { Button, Spinner, Toggle } from "@/components/ui";
import { CycleModal } from "./CycleModal";
import { CycleTicketsField } from "./CycleTicketsField";
import { CycleThemeEditor } from "./CycleThemeEditor";
import { useCycles } from "./CyclesProvider";
import { useCycleRun } from "./hooks/useCycleRun";
import { getCycle } from "./lib/api";
import type { Cycle, CycleCreate, ThemeSpec } from "@/types/cycles";

interface FormState {
  name: string;
  description: string;
  projectKey: string;
  versionHint: string;
  ticketKeys: string[];
  themes: ThemeSpec[];
  testCaseRefs: string[];
  pinned: boolean;
  lockTestCases: boolean;
}

const empty: FormState = {
  name: "",
  description: "",
  projectKey: "",
  versionHint: "",
  ticketKeys: [],
  themes: [],
  testCaseRefs: [],
  pinned: false,
  lockTestCases: false,
};

interface Props {
  mode: "create" | "edit";
  /** When `mode === "edit"`, pass the summary or full Cycle. */
  existing?: { id: string };
  /** Pre-fill values for create. */
  prefill?: Partial<CycleCreate>;
  onClose: () => void;
}

export function CycleBuilderDialog({
  mode,
  existing,
  prefill,
  onClose,
}: Props) {
  const { create, update } = useCycles();
  const { run } = useCycleRun();

  const [form, setForm] = useState<FormState>(() => ({
    ...empty,
    name: prefill?.name ?? "",
    description: prefill?.description ?? "",
    projectKey: prefill?.projectKey ?? "",
    versionHint: prefill?.versionHint ?? "",
    ticketKeys: prefill?.ticketKeys ?? [],
    themes: prefill?.themes ?? [],
    testCaseRefs: prefill?.testCaseRefs ?? [],
    pinned: prefill?.pinned ?? false,
    lockTestCases: (prefill?.testCaseRefs?.length ?? 0) > 0,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !existing) return;
    let cancelled = false;
    void (async () => {
      try {
        const full: Cycle = await getCycle(existing.id);
        if (cancelled) return;
        setForm({
          name: full.name,
          description: full.description,
          projectKey: full.projectKey,
          versionHint: full.versionHint,
          ticketKeys: full.ticketKeys,
          themes: full.themes,
          testCaseRefs: full.testCaseRefs,
          pinned: full.pinned,
          lockTestCases: full.testCaseRefs.length > 0,
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load cycle");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existing, mode]);

  const valid = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.projectKey.trim().length > 0 &&
      form.ticketKeys.length > 0,
    [form],
  );

  async function save(opts: { andRun?: boolean }) {
    if (!valid) return;
    setError(null);
    setBusy(true);
    try {
      const payload: CycleCreate = {
        name: form.name.trim(),
        description: form.description,
        projectKey: form.projectKey.trim().toUpperCase(),
        versionHint: form.versionHint.trim(),
        ticketKeys: form.ticketKeys,
        themes: form.themes,
        testCaseRefs: form.lockTestCases ? form.testCaseRefs : [],
        pinned: form.pinned,
      };
      let saved: Cycle;
      if (mode === "create") {
        saved = await create(payload);
      } else if (existing) {
        saved = await update(existing.id, payload);
      } else {
        return;
      }
      if (opts.andRun && saved) {
        await run(saved.id, saved.name);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "create" ? "New test cycle" : `Edit ${form.name || "cycle"}`;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      {mode === "create" && (
        <Button
          variant="secondary"
          onClick={() => void save({ andRun: true })}
          disabled={!valid || busy || loading}
        >
          Save and run
        </Button>
      )}
      <Button
        variant="primary"
        onClick={() => void save({})}
        disabled={!valid || busy || loading}
        leading={busy ? <Spinner size={12} /> : undefined}
      >
        Save
      </Button>
    </>
  );

  return (
    <CycleModal title={title} ariaLabel={title} onClose={onClose} footer={footer}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Name" required>
            <input
              autoFocus
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="FM monthly regression"
              className="g-input text-[12.5px]"
              autoComplete="off"
            />
          </Field>

          <Field label="Description" hint="Free text — scanned for secrets on save.">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              className="g-input text-[12px]"
              spellCheck
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Project key" required>
              <input
                value={form.projectKey}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    projectKey: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="FM"
                className="g-input text-[12px] font-mono"
                autoComplete="off"
              />
            </Field>
            <Field label="Version hint">
              <input
                value={form.versionHint}
                onChange={(e) =>
                  setForm((f) => ({ ...f, versionHint: e.target.value }))
                }
                placeholder="24.3 or Q2 2026"
                className="g-input text-[12px]"
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label="Tickets" required>
            <CycleTicketsField
              value={form.ticketKeys}
              onChange={(ticketKeys) =>
                setForm((f) => ({ ...f, ticketKeys }))
              }
            />
          </Field>

          <CycleThemeEditor
            value={form.themes}
            availableKeys={form.ticketKeys}
            onChange={(themes) => setForm((f) => ({ ...f, themes }))}
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Toggle
                checked={form.lockTestCases}
                onChange={(lockTestCases) =>
                  setForm((f) => ({ ...f, lockTestCases }))
                }
                aria-label="Lock test cases"
              />
              <span className="text-[12px] text-ink">
                Lock test cases
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Toggle
                checked={form.pinned}
                onChange={(pinned) => setForm((f) => ({ ...f, pinned }))}
                aria-label="Pinned"
              />
              <span className="text-[12px] text-ink">Pinned</span>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-err/30 bg-err/10 px-2 py-1.5 text-[11.5px] text-err"
            >
              {error}
            </div>
          )}
        </div>
      )}
    </CycleModal>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11.5px] font-medium text-ink mb-1">
        {label}
        {required && <span className="ml-1 text-err">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}
