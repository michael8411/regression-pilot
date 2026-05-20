import { useState } from "react";
import { useAttachments } from "@/components/assistant/hooks/useAttachments";
import { ContextPickerHeader } from "./ContextPickerHeader";
import { AttachmentList } from "./AttachmentList";
import { TicketPicker } from "./pickers/TicketPicker";
import { TestCasePicker } from "./pickers/TestCasePicker";
import { SessionPicker } from "./pickers/SessionPicker";
import { ToolPickerTab } from "@/components/mcp";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { clsx } from "clsx";

type ActivePicker = null | "ticket" | "test_case" | "session_ref";
type Tab = "context" | "tools";

export function ContextPicker() {
  const { attachments, add, remove } = useAttachments();
  const [picker, setPicker] = useState<ActivePicker>(null);
  const showToolsTab = isFeatureEnabled("mcpV2");
  const [tab, setTab] = useState<Tab>("context");

  const renderTabs = () => {
    if (!showToolsTab) return null;
    return (
      <div
        role="tablist"
        aria-label="Context picker tabs"
        className="flex border-b border-subtle"
      >
        <TabButton
          active={tab === "context"}
          onClick={() => setTab("context")}
          label="Context"
        />
        <TabButton
          active={tab === "tools"}
          onClick={() => setTab("tools")}
          label="Tools"
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {tab === "context" && (
        <ContextPickerHeader onPick={(k) => setPicker(k)} />
      )}
      {renderTabs()}
      <div className="flex-1 overflow-y-auto">
        {tab === "context" ? (
          <AttachmentList
            attachments={attachments}
            onRemove={(id) => void remove(id)}
          />
        ) : (
          <ToolPickerTab />
        )}
      </div>

      {picker === "ticket" && (
        <TicketPicker
          onPick={async (key) => {
            try {
              await add("ticket", key);
            } finally {
              setPicker(null);
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "test_case" && (
        <TestCasePicker
          onPick={async (refs) => {
            try {
              for (const r of refs) await add("test_case", r);
            } finally {
              setPicker(null);
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "session_ref" && (
        <SessionPicker
          onPick={async (sid) => {
            try {
              await add("session_ref", sid);
            } finally {
              setPicker(null);
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        "flex-1 px-3 py-2 text-[11.5px] font-medium",
        "border-b-2 -mb-px transition-colors",
        active
          ? "border-accent text-ink"
          : "border-transparent text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
