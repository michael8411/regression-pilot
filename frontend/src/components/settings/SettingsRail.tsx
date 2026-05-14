import { clsx } from "clsx";
import {
  Database,
  Folder,
  Info,
  Key,
  Keyboard,
  Plug,
  SlidersHorizontal,
  type IconComponent,
} from "@/lib/icons";
import { useRoute } from "@/contexts/RouteContext";

export type SettingsPaneId =
  | "credentials"
  | "preferences"
  | "connections"
  | "repo-mapping"
  | "data-privacy"
  | "shortcuts"
  | "about";

interface RailItem {
  id: SettingsPaneId;
  label: string;
  icon: IconComponent;
}

export const SETTINGS_PANES: RailItem[] = [
  { id: "credentials",  label: "Credentials",    icon: Key },
  { id: "preferences",  label: "Preferences",    icon: SlidersHorizontal },
  { id: "connections",  label: "Connections",    icon: Plug },
  { id: "repo-mapping", label: "Repo Mapping",   icon: Folder },
  { id: "data-privacy", label: "Data & privacy", icon: Database },
  { id: "shortcuts",    label: "Shortcuts",      icon: Keyboard },
  { id: "about",        label: "About",          icon: Info },
];

interface Props {
  active: SettingsPaneId;
}

export function SettingsRail({ active }: Props) {
  const { gotoSettingsPane } = useRoute();
  return (
    <nav
      aria-label="Settings sections"
      className="w-[220px] shrink-0 border-r border-subtle bg-surface flex flex-col py-3"
    >
      {SETTINGS_PANES.map(({ id, label, icon: Icon }) => {
        const current = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => gotoSettingsPane(id)}
            aria-current={current ? "page" : undefined}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 text-[12.5px] text-left",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              current
                ? "bg-accent-dim text-accent-text border-l-2 border-accent"
                : "text-ink-secondary hover:bg-surface-overlay hover:text-ink border-l-2 border-transparent",
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
