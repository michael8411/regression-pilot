import { useMemo, useState } from "react";
import { Ticket } from "@/lib/icons";
import { isLikelyJiraKey } from "@/components/assistant/lib/attachmentUtils";
import { useSession } from "@/hooks/useSession";
import type { JiraTicket } from "@/types";
import { PickerModal } from "./PickerModal";

interface Props {
  onPick: (key: string) => void;
  onClose: () => void;
}

export function TicketPicker({ onPick, onClose }: Props) {
  const { restoredState } = useSession();
  const sessionTickets = useMemo<JiraTicket[]>(
    () =>
      Array.isArray(restoredState?.selectedTickets)
        ? (restoredState!.selectedTickets as JiraTicket[])
        : [],
    [restoredState],
  );
  const [text, setText] = useState("");
  const valid = isLikelyJiraKey(text);

  return (
    <PickerModal title="Add ticket" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11.5px] text-ink-muted mb-1 block">
            Ticket key
          </label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.toUpperCase())}
              placeholder="FM-1234"
              className="g-input flex-1 text-[12.5px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) onPick(text.trim());
              }}
            />
            <button
              type="button"
              disabled={!valid}
              onClick={() => onPick(text.trim())}
              className="g-btn-solid text-[12px] px-3 disabled:opacity-30"
            >
              Attach
            </button>
          </div>
        </div>
        {sessionTickets.length > 0 && (
          <div>
            <div className="text-[11.5px] text-ink-muted mb-1">
              Or pick from this session
            </div>
            <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {sessionTickets.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => onPick(t.key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-overlay text-left"
                  >
                    <Ticket size={11} className="text-accent-text shrink-0" />
                    <span className="font-mono text-[11.5px] text-ink shrink-0">
                      {t.key}
                    </span>
                    <span className="text-[11.5px] text-ink-muted truncate">
                      {t.summary}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PickerModal>
  );
}
