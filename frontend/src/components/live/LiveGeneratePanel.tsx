import { useState } from "react";
import { Loader2, X } from "@/lib/icons";
import { useLiveGenerate } from "./hooks/useLiveGenerate";
import { GeneratedTestCaseCard } from "./GeneratedTestCaseCard";
import type { JiraTicket } from "@/types";

interface Props {
  ticket: JiraTicket;
  onClose: () => void;
}

export function LiveGeneratePanel({ ticket, onClose }: Props) {
  const [instructions, setInstructions] = useState("");
  const { generate, generating, result, error, reset } = useLiveGenerate();

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(result.test_cases, null, 2),
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="px-4 py-3 border-b border-subtle bg-surface-overlay/30">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">
          Generate live test cases
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close generator"
          className="text-ink-muted hover:text-ink"
        >
          <X size={11} />
        </button>
      </div>

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional: focus on edge cases / negative scenarios / specific user roles."
        rows={2}
        className="g-input w-full text-[11.5px] min-h-[48px] max-h-[120px] resize-none"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void generate(ticket, instructions)}
          disabled={generating}
          className="g-btn-solid text-[12px] px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {generating && <Loader2 size={11} className="animate-spin" />}
          {generating ? "Generating…" : result ? "Regenerate" : "Generate"}
        </button>
        {result && (
          <>
            <button
              type="button"
              onClick={() => void copyJson()}
              className="g-btn text-[12px] px-3 py-1.5"
            >
              Copy as JSON
            </button>
            <button
              type="button"
              onClick={reset}
              className="g-btn text-[12px] px-3 py-1.5"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-2 text-[11.5px] text-err bg-err/[0.06] border border-err/30 rounded-md px-2 py-1.5"
        >
          {error}
        </div>
      )}

      {result && (
        <ul className="mt-3 flex flex-col gap-2">
          {(result.test_cases ?? []).map((tc, i) => (
            <li key={i}>
              <GeneratedTestCaseCard testCase={tc} index={i} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
