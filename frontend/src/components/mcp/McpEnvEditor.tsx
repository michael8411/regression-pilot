import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui";

interface Props {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export function McpEnvEditor({ value, onChange }: Props) {
  const entries = Object.entries(value);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  function update(idx: number, nextKey: string, nextVal: string) {
    const newEntries = entries.slice();
    newEntries[idx] = [nextKey, nextVal];
    onChange(
      Object.fromEntries(newEntries.filter(([k]) => k.length > 0 || nextVal === "")),
    );
  }

  function remove(idx: number) {
    const newEntries = entries.filter((_, i) => i !== idx);
    onChange(Object.fromEntries(newEntries));
    setReveal((r) => {
      const { [idx]: _drop, ...rest } = r;
      return rest;
    });
  }

  function add() {
    if (Object.prototype.hasOwnProperty.call(value, "")) return;
    onChange({ ...value, "": "" });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-medium text-ink">Environment</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={add}
          leading={<Plus size={12} />}
        >
          Add
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-ink-faint">
          No environment variables.
        </p>
      ) : null}
      {entries.map(([k, v], idx) => {
        const showing = reveal[idx] === true;
        return (
          <div key={`row-${idx}`} className="flex items-center gap-2">
            <input
              value={k}
              onChange={(e) => update(idx, e.target.value, v)}
              placeholder="VAR_NAME"
              className="g-input text-[12px] font-mono w-1/3"
              spellCheck={false}
              autoComplete="off"
            />
            <input
              type={showing ? "text" : "password"}
              value={v}
              onChange={(e) => update(idx, k, e.target.value)}
              placeholder="value"
              className="g-input text-[12px] font-mono flex-1"
              spellCheck={false}
              autoComplete="off"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setReveal((r) => ({ ...r, [idx]: !showing }))
              }
              aria-label={showing ? "Hide value" : "Show value"}
              title={showing ? "Hide value" : "Show value"}
            >
              {showing ? <EyeOff size={12} /> : <Eye size={12} />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => remove(idx)}
              aria-label={`Remove ${k || "row"}`}
              title="Remove"
            >
              <Trash2 size={12} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
