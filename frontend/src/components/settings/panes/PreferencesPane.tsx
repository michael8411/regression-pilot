import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "@/lib/icons";
import { Segmented, Toggle } from "@/components/ui";
import { useTheme } from "@/contexts/ThemeContext";
import { getPreferences, savePreferences } from "@/lib/api";
import type { Preferences } from "@/types";
import { SettingsPaneHeader } from "../SettingsPaneHeader";

const DEFAULT_PREFS: Preferences = {
  theme: "system",
  project_scope: [],
  default_version_status: "unreleased",
  auto_select_tickets: false,
  default_zephyr_folder: null,
  ai_model: "gemini-2.5-flash",
  ai_temperature: 0.4,
  export_format: "json",
};

type SaveState = "idle" | "saving" | "saved";

export function PreferencesPane() {
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from backend.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await getPreferences();
        if (cancelled) return;
        setPrefs({ ...DEFAULT_PREFS, ...next });
      } catch {
        /* ignore — keep defaults */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function scheduleSave(patch: Partial<Preferences>) {
    setPrefs((p) => ({ ...p, ...patch }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await savePreferences(patch);
        setSaveState("saved");
        if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
        savedFlashRef.current = setTimeout(
          () => setSaveState("idle"),
          1600,
        );
      } catch {
        setSaveState("idle");
      }
    }, 300);
  }

  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="Preferences"
        subtitle="Defaults across the app. Changes save automatically."
      />
      <div className="flex-1 px-6 py-4 flex flex-col gap-5 max-w-[640px]">
        <SaveBadge state={loading ? "saving" : saveState} />

        <Section
          label="Appearance"
          hint="System follows your OS preference."
        >
          <Field label="Theme">
            <Segmented<"dark" | "light" | "system">
              aria-label="Theme"
              value={theme}
              onChange={(v) => {
                setTheme(v);
                scheduleSave({ theme: v });
              }}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "system", label: "System" },
              ]}
            />
          </Field>
        </Section>

        <Section label="Defaults" hint="Used when picking new tickets and folders.">
          <Field label="Default version status">
            <Segmented<Preferences["default_version_status"]>
              aria-label="Default version status"
              value={prefs.default_version_status}
              onChange={(v) => scheduleSave({ default_version_status: v })}
              options={[
                { value: "unreleased", label: "Unreleased" },
                { value: "released", label: "Released" },
                { value: "all", label: "All" },
              ]}
            />
          </Field>
          <Field label="Auto-select tickets when version loads">
            <Toggle
              checked={prefs.auto_select_tickets}
              onChange={(auto_select_tickets) =>
                scheduleSave({ auto_select_tickets })
              }
              aria-label="Auto-select tickets when version loads"
            />
          </Field>
          <Field
            label="Default Zephyr folder id"
            hint="Used as the default destination when pushing test cases."
          >
            <input
              type="number"
              value={prefs.default_zephyr_folder ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                scheduleSave({
                  default_zephyr_folder: raw === "" ? null : Number(raw),
                });
              }}
              placeholder="(none)"
              className="g-input text-[12.5px] w-40"
            />
          </Field>
        </Section>

        <Section label="AI">
          <Field label="Model">
            <input
              value={prefs.ai_model}
              onChange={(e) => scheduleSave({ ai_model: e.target.value })}
              className="g-input text-[12.5px] font-mono w-full max-w-[320px]"
              spellCheck={false}
            />
          </Field>
          <Field label="Default export format">
            <Segmented<Preferences["export_format"]>
              aria-label="Default export format"
              value={prefs.export_format}
              onChange={(v) => scheduleSave({ export_format: v })}
              options={[
                { value: "json", label: "JSON" },
                { value: "csv", label: "CSV" },
                { value: "markdown", label: "Markdown" },
              ]}
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="self-end text-[11px] text-ink-muted flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
  }
  return (
    <span className="self-end text-[11px] text-ok flex items-center gap-1">
      <Check size={11} /> Saved
    </span>
  );
}

interface SectionProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Section({ label, hint, children }: SectionProps) {
  return (
    <section className="rounded-lg border border-subtle bg-surface-elevated px-4 py-3">
      <header className="mb-2">
        <h3 className="text-[12px] font-semibold text-ink">{label}</h3>
        {hint && <p className="text-[10.5px] text-ink-faint">{hint}</p>}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11.5px] font-medium text-ink mb-1">
        {label}
      </label>
      <div>{children}</div>
      {hint && <p className="mt-1 text-[10.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}
