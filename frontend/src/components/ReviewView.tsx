import { useState } from "react";
import { clsx } from "clsx";
import {
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Upload,
  Loader2,
  Check,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { pushTestCases } from "@/lib/api";
import type { TestCase } from "@/types";

interface ReviewViewProps {
  testCases: TestCase[];
  projectKey: string;
  onBack: () => void;
  onUpdateTestCases: (cases: TestCase[]) => void;
}

export function ReviewView({ testCases, projectKey, onBack, onUpdateTestCases }: ReviewViewProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ created: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setError(null);
    try {
      const result = await pushTestCases(projectKey, testCases);
      setPushResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPushing(false);
    }
  };

  const handleRemove = (index: number) => {
    const updated = testCases.filter((_, i) => i !== index);
    onUpdateTestCases(updated);
    if (expandedIndex === index) setExpandedIndex(null);
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-hidden animate-fade">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ok/10 flex items-center justify-center">
            <ClipboardCheck size={18} className="text-ok" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Review Test Cases</h2>
            <p className="text-xs text-ink-muted">{testCases.length} test cases generated — review before pushing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="g-btn flex items-center gap-2 text-xs">
            <ArrowLeft size={13} />
            Back
          </button>
          {!pushResult && (
            <button
              onClick={handlePush}
              disabled={pushing || testCases.length === 0}
              className="g-btn-solid flex items-center gap-2 px-5 disabled:opacity-50"
            >
              {pushing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Pushing...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Push to Zephyr Scale
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {pushResult && (
        <div className="p-4 rounded-xl bg-ok/10 border border-success/20 flex items-center gap-3 animate-in">
          <div className="w-8 h-8 rounded-full bg-ok/20 flex items-center justify-center">
            <Check size={16} className="text-ok" />
          </div>
          <div>
            <p className="text-sm font-medium text-ok">
              Successfully pushed {pushResult.created} test cases to Zephyr Scale
            </p>
            <p className="text-xs text-ok/60 mt-0.5">Check your Jira project to see them</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-err/10 border border-danger/20 text-sm text-err/90">{error}</div>
      )}

      {/* Test Case Accordion */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {testCases.map((tc, i) => (
          <div key={i} className="glass overflow-hidden animate-in" style={{ animationDelay: `${i * 40}ms` }}>
            {/* Header Row */}
            <div
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
            >
              {expandedIndex === i ? (
                <ChevronDown size={14} className="text-ink-muted shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-ink-muted shrink-0" />
              )}

              <span
                className={clsx(
                  "text-[10px] font-semibold px-2 py-0.5 rounded shrink-0",
                  tc.priority === "Critical" && "bg-err/15 text-err",
                  tc.priority === "High" && "bg-warn/15 text-warn",
                  tc.priority === "Medium" && "bg-accent/15 text-accent-light",
                  tc.priority === "Low" && "bg-white/5 text-ink-muted"
                )}
              >
                {tc.priority}
              </span>

              <span className="text-sm text-white/75 flex-1 truncate">{tc.name}</span>

              <span className="text-[11px] text-ink-faint">{tc.steps.length} steps</span>

              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                className="p-1 rounded hover:bg-err/10 transition-colors"
              >
                <Trash2 size={13} className="text-ink-faint hover:text-err" />
              </button>
            </div>

            {/* Expanded Content */}
            {expandedIndex === i && (
              <div className="px-4 pb-4 border-t border-white/[0.04] pt-3 space-y-4 animate-fade">
                {/* Objective */}
                <div>
                  <h4 className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1">Objective</h4>
                  <p className="text-sm text-ink-secondary">{tc.objective}</p>
                </div>

                {/* Preconditions */}
                {tc.preconditions.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1">Preconditions</h4>
                    <ul className="space-y-1">
                      {tc.preconditions.map((p, j) => (
                        <li key={j} className="text-sm text-ink-secondary flex items-start gap-2">
                          <span className="text-accent/50 mt-1">•</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Steps */}
                <div>
                  <h4 className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-2">Test Steps</h4>
                  <div className="space-y-2">
                    {tc.steps.map((step) => (
                      <div key={step.step_number} className="flex gap-3 p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-[11px] font-mono text-accent/50 w-5 shrink-0 text-right mt-0.5">
                          {step.step_number}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm text-white/65">{step.action}</p>
                          <p className="text-xs text-ok/60 mt-1">
                            Expected: {step.expected_result}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Labels */}
                {tc.labels.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {tc.labels.map((label) => (
                      <span
                        key={label}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-ink-muted border border-white/[0.06]"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
