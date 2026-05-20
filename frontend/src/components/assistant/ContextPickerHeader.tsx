import { AddAttachmentMenu } from "./AddAttachmentMenu";

interface Props {
  onPick: (kind: "ticket" | "test_case" | "session_ref") => void;
}

export function ContextPickerHeader({ onPick }: Props) {
  return (
    <header className="flex items-center justify-between px-3 py-2.5 border-b border-subtle">
      <div>
        <h2 className="text-[12.5px] font-semibold text-ink">Context</h2>
        <p className="text-[10.5px] text-ink-faint">
          Tickets and references the assistant can use.
        </p>
      </div>
      <AddAttachmentMenu onPick={onPick} />
    </header>
  );
}
