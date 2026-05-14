import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";
import { IconButton } from "@/components/ui";
import { useRoute } from "@/contexts/RouteContext";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { SettingsRail, type SettingsPaneId } from "./SettingsRail";
import { CredentialsPane } from "./panes/CredentialsPane";
import { PreferencesPane } from "./panes/PreferencesPane";
import { ConnectionsPane } from "./panes/ConnectionsPane";
import { RepoMappingPane } from "./panes/RepoMappingPane";
import { DataPrivacyPane } from "./panes/DataPrivacyPane";
import { ShortcutsPane } from "./panes/ShortcutsPane";
import { AboutPane } from "./panes/AboutPane";

const PANES: SettingsPaneId[] = [
  "credentials",
  "preferences",
  "connections",
  "repo-mapping",
  "data-privacy",
  "shortcuts",
  "about",
];

function readPaneFromUrl(): SettingsPaneId {
  if (typeof window === "undefined") return "credentials";
  try {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get("pane") as SettingsPaneId | null;
    return candidate && PANES.includes(candidate) ? candidate : "credentials";
  } catch {
    return "credentials";
  }
}

export function SettingsOverlay() {
  const { route, routeNonce, closeOverlay } = useRoute();
  const open =
    route[0] === "settings" && isFeatureEnabled("settingsV2");

  const pane = useMemo<SettingsPaneId>(
    readPaneFromUrl,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, routeNonce],
  );

  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    drawerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      triggerRef.current?.focus();
    };
  }, [open, closeOverlay]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={closeOverlay}
      className="fixed inset-0 z-[7900] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(960px, 92vw)",
          height: "min(720px, 88vh)",
        }}
        className="flex overflow-hidden flex-col rounded-xl border border-subtle bg-surface-elevated shadow-float focus:outline-none"
      >
        <header className="flex justify-between items-center px-5 py-3 border-b border-subtle">
          <h1 className="text-[14px] font-semibold text-ink">Settings</h1>
          <div className="flex gap-2 items-center">
            <IconButton
              size="sm"
              aria-label="Close"
              icon={<X size={14} />}
              onClick={closeOverlay}
            />
          </div>
        </header>
        <div className="flex flex-1 min-h-0">
          <SettingsRail active={pane} />
          <section className="overflow-auto flex-1 min-w-0 bg-surface">
            {renderPane(pane)}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function renderPane(pane: SettingsPaneId) {
  switch (pane) {
    case "credentials":
      return <CredentialsPane />;
    case "preferences":
      return <PreferencesPane />;
    case "connections":
      return <ConnectionsPane />;
    case "repo-mapping":
      return <RepoMappingPane />;
    case "data-privacy":
      return <DataPrivacyPane />;
    case "shortcuts":
      return <ShortcutsPane />;
    case "about":
      return <AboutPane />;
  }
}
