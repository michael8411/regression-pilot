import { Kbd } from "@/components/ui";
import { SHORTCUTS, SHORTCUT_GROUPS } from "../lib/shortcuts";
import { SettingsPaneHeader } from "../SettingsPaneHeader";

export function ShortcutsPane() {
  return (
    <div className="flex flex-col h-full">
      <SettingsPaneHeader
        title="Shortcuts"
        subtitle="Read-only reference. Hooks and keybindings are wired by the workspace they belong to."
      />
      <div className="flex-1 px-6 py-4 max-w-[640px]">
        {SHORTCUT_GROUPS.map((group) => {
          const rows = SHORTCUTS.filter((s) => s.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} className="mb-5">
              <h3 className="mb-2 text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">
                {group}
              </h3>
              <ul className="rounded-lg border border-subtle bg-surface-elevated divide-y divide-subtle">
                {rows.map((row, i) => (
                  <li
                    key={`${group}-${i}`}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="text-[12px] text-ink">{row.label}</span>
                    <span className="flex items-center gap-1">
                      {row.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
