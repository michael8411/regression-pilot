/**
 * Phase 05 — drawer AI tab.
 *
 * Composes the LiveGeneratePanel subcomponents (prompt field, toggle card,
 * tools row) so the AI panel never duplicates markup. During generation,
 * renders a <GenerationSkeletonList> with N skeleton cards (one per maxCases).
 *
 * Exposes an imperative ref so the sticky drawer footer "Generate test cases"
 * CTA can trigger generation from any tab.
 */

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";
import { Loader2 } from "@/lib/icons";
import { useLiveGenerate } from "../hooks/useLiveGenerate";
import {
  composeInstructions,
  DEFAULT_GENERATE_OPTIONS,
  LiveGeneratePromptField,
  LiveGenerateResultList,
  LiveGenerateToggles,
  LiveGenerateToolsRow,
  type LiveGenerateOptions,
} from "../LiveGeneratePanel";
import { GenerationSkeletonList } from "@/components/live/visual";
import type { JiraTicket } from "@/types";

export interface DrawerAiPanelHandle {
  /** Triggered by the sticky footer CTA from any tab. */
  generate: () => void;
}

interface Props {
  ticket: JiraTicket;
}

export const DrawerAiPanel = forwardRef<DrawerAiPanelHandle, Props>(
  function DrawerAiPanel({ ticket }, ref) {
    const [prompt, setPrompt] = useState("");
    const [options, setOptions] = useState<LiveGenerateOptions>(
      DEFAULT_GENERATE_OPTIONS,
    );
    const { generate, generating, result, error } = useLiveGenerate();

    const handleGenerate = useCallback(() => {
      void generate(ticket, composeInstructions(prompt, options));
    }, [generate, ticket, prompt, options]);

    useImperativeHandle(
      ref,
      () => ({
        generate: handleGenerate,
      }),
      [handleGenerate],
    );

    return (
      <div
        id="drawer-panel-ai"
        role="tabpanel"
        aria-labelledby="drawer-tab-ai"
        className="px-4 py-3 flex flex-col gap-3"
      >
        <LiveGeneratePromptField value={prompt} onChange={setPrompt} />

        <LiveGenerateToggles
          options={options}
          onChange={setOptions}
          disabled={generating}
        />

        <LiveGenerateToolsRow />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="g-btn text-[12px] px-3 py-1.5 inline-flex items-center gap-1.5 text-ai border-ai/30 hover:border-ai/60 disabled:opacity-50"
            style={{ background: "var(--ai-dim)" }}
          >
            {generating && <Loader2 size={11} className="animate-spin" />}
            {generating ? "Generating…" : result ? "Regenerate" : "Generate"}
          </button>
          {result && !generating && (
            <span className="text-[10.5px] text-ink-faint font-mono">
              {result.test_cases?.length ?? 0} cases drafted
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="text-[11.5px] text-err bg-err/[0.06] border border-err/30 rounded-md px-2 py-1.5"
          >
            {error}
          </div>
        )}

        {generating && (
          <GenerationSkeletonList count={options.maxCases} />
        )}

        {!generating && result && <LiveGenerateResultList result={result} />}
      </div>
    );
  },
);
