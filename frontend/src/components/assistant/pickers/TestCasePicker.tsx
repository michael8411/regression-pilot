import { useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { encodeTestCaseRef } from "@/components/assistant/lib/attachmentUtils";
import type { TestCase } from "@/types";
import { PickerModal } from "./PickerModal";

interface Props {
  onPick: (refs: string[]) => void;
  onClose: () => void;
}

export function TestCasePicker({ onPick, onClose }: Props) {
  const { restoredState, sessionId } = useSession();
  const cases: TestCase[] = useMemo(
    () =>
      Array.isArray(restoredState?.testCases)
        ? (restoredState!.testCases as TestCase[])
        : [],
    [restoredState],
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const refs = useMemo(
    () =>
      Array.from(selected)
        .sort((a, b) => a - b)
        .map((i) => encodeTestCaseRef(sessionId ?? "", i)),
    [selected, sessionId],
  );

  if (!sessionId || cases.length === 0) {
    return (
      <PickerModal title="Attach test cases" onClose={onClose}>
        <p className="text-[12px] text-ink-muted">
          The current session has no generated test cases yet.
        </p>
      </PickerModal>
    );
  }

  return (
    <PickerModal title="Attach test cases" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {cases.map((tc, i) => (
            <li
              key={i}
              className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-surface-overlay"
            >
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    return next;
                  });
                }}
              />
              <div className="min-w-0">
                <div className="text-[12px] text-ink truncate">
                  #{i + 1} {tc.name ?? "Test case"}
                </div>
                {tc.objective && (
                  <div className="text-[10.5px] text-ink-faint truncate">
                    {tc.objective}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="g-btn text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={refs.length === 0}
            onClick={() => onPick(refs)}
            className="g-btn-solid text-[12px] px-3 disabled:opacity-30"
          >
            Attach {refs.length || ""}
          </button>
        </div>
      </div>
    </PickerModal>
  );
}
