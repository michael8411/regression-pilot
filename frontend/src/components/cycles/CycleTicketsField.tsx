import {
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { Plus, X } from "@/lib/icons";
import { Badge, Button } from "@/components/ui";

const KEY_RE = /^[A-Z]+-\d+$/;

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

function normalize(raw: string): string {
  return raw.trim().toUpperCase();
}

function parseBag(raw: string): { keys: string[]; invalid: string[] } {
  const tokens = raw.split(/[\s,]+/).filter(Boolean).map(normalize);
  const seen = new Set<string>();
  const keys: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (KEY_RE.test(t)) {
      if (!seen.has(t)) {
        seen.add(t);
        keys.push(t);
      }
    } else {
      invalid.push(t);
    }
  }
  return { keys, invalid };
}

export function CycleTicketsField({ value, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null);

  const addBag = (raw: string) => {
    const { keys, invalid } = parseBag(raw);
    if (keys.length === 0 && invalid.length === 0) return;
    const dedup = new Set(value);
    const next = [...value];
    for (const k of keys) {
      if (!dedup.has(k)) {
        dedup.add(k);
        next.push(k);
      }
    }
    if (next.length !== value.length) onChange(next);
    setSkippedNotice(
      invalid.length > 0
        ? `Skipped: ${invalid.slice(0, 8).join(", ")}${
            invalid.length > 8 ? "…" : ""
          } — not Jira keys.`
        : null,
    );
  };

  const commitDraft = () => {
    const raw = draft;
    setDraft("");
    addBag(raw);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      const raw = draft.trim();
      if (raw) {
        e.preventDefault();
        commitDraft();
      }
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text && /[\s,]/.test(text)) {
      e.preventDefault();
      setDraft("");
      addBag(text);
    }
  };

  const remove = (key: string) => {
    onChange(value.filter((k) => k !== key));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-subtle bg-surface px-2 py-1.5 min-h-[36px]">
        {value.map((k) => (
          <Badge key={k} tone="accent" size="sm">
            <span className="font-mono">{k}</span>
            <button
              type="button"
              onClick={() => remove(k)}
              aria-label={`Remove ${k}`}
              className="ml-1 inline-flex items-center text-accent-text/70 hover:text-ink"
            >
              <X size={10} />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          onBlur={commitDraft}
          placeholder={
            value.length === 0
              ? "Paste keys, or type FM-1 then Enter"
              : ""
          }
          className="flex-1 min-w-[120px] bg-transparent text-[12px] font-mono outline-none placeholder:text-ink-faint"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px]">
        <span className="text-ink-faint">
          {value.length} {value.length === 1 ? "ticket" : "tickets"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => commitDraft()}
          leading={<Plus size={11} />}
        >
          Add
        </Button>
      </div>
      {skippedNotice && (
        <p className="mt-1 text-[10.5px] text-warn">{skippedNotice}</p>
      )}
    </div>
  );
}
