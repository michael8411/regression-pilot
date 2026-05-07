import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "@/lib/icons";
import { Badge, Button } from "@/components/ui";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function McpAutoApproveEditor({ value, onChange }: Props) {
  const [draft, setDraft] = useState("");

  function add() {
    const name = draft.trim();
    if (!name) return;
    if (value.includes(name)) {
      setDraft("");
      return;
    }
    onChange([...value, name]);
    setDraft("");
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[12px] font-medium text-ink">
        Auto-approve tools
      </label>
      <p className="text-[11px] text-ink-faint">
        Tool names listed here will run without asking for approval each time.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="tool_name"
          className="g-input text-[12px] font-mono flex-1"
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={add}
          leading={<Plus size={12} />}
        >
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {value.map((name) => (
          <Badge key={name} tone="info" size="sm">
            <span className="font-mono">{name}</span>
            <button
              type="button"
              className="ml-1 inline-flex items-center text-info hover:text-ink"
              onClick={() => remove(name)}
              aria-label={`Remove ${name}`}
            >
              <X size={10} />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
