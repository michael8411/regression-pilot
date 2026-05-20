import { MessageSquare } from "@/lib/icons";

interface Props {
  onNew: () => void;
}

export function ConversationListEmpty({ onNew }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-10 h-10 rounded-lg bg-accent-dim border border-accent/[0.15] flex items-center justify-center mb-3">
        <MessageSquare size={16} className="text-accent-text" />
      </div>
      <p className="text-[12.5px] text-ink-muted leading-relaxed max-w-[200px]">
        Conversations save automatically. Start one to see it here.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-3 g-btn-solid text-[12px] px-3 py-1.5"
      >
        New conversation
      </button>
    </div>
  );
}
