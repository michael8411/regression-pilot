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
import type { PushResult, TestCase } from "@/types";

interface ReviewViewProps {
  testCases: TestCase[];
  projectKey: string;
  onBack: () => void;
  onUpdateTestCases: (cases: TestCase[]) => void;
  saveStateImmediate: (key: string, value: unknown) => Promise<void>;
  initialPushResult?: PushResult;
}

export function ReviewView({
  testCases,
  projectKey,
  onBack,
  onUpdateTestCases,
  saveStateImmediate,
  initialPushResult,
}: ReviewViewProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(
    initialPushResult ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setError(null);
    try {
      const result = await pushTestCases(projectKey, testCases);
      setPushResult(result);
      void saveStateImmediate("pushResult", result);
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
    <div className="flex overflow-hidden flex-col flex-1 gap-5 p-6 animate-fade">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <div className="flex justify-center items-center w-9 h-9 rounded-lg bg-ok/10">
            <ClipboardCheck size={18} className="text-ok" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">
              Review Test Cases
            </h2>
            <p className="text-xs text-ink-muted">
              {testCases.length} test cases generated — review before pushing
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={onBack}
            className="flex gap-2 items-center text-xs g-btn"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          {!pushResult && (
            <button
              onClick={handlePush}
              disabled={pushing || testCases.length === 0}
              className="flex gap-2 items-center px-5 g-btn-solid disabled:opacity-50"
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
        <div className="p-4 rounded-[10px] bg-ok/10 border border-ok/20 flex items-center gap-3 animate-in">
          <div className="flex justify-center items-center w-8 h-8 rounded-full bg-ok/20">
            <Check size={16} className="text-ok" />
          </div>
          <div>
            <p className="text-sm font-medium text-ok">
              Successfully pushed {pushResult.created} test cases to Zephyr
              Scale
            </p>
            <p className="text-xs text-ok/60 mt-0.5">
              Check your Jira project to see them
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-[10px] bg-err/10 border border-err/20 text-sm text-err/90">
          {error}
        </div>
      )}

      {/* Test Case Accordion */}
      <div className="overflow-y-auto flex-1 space-y-2">
        {testCases.map((tc, i) => (
          <div
            key={i}
            className="overflow-hidden surface animate-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {/* Header Row */}
            <div
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className="flex gap-3 items-center px-4 py-3 transition-colors cursor-pointer hover:bg-surface-overlay"
            >
              {expandedIndex === i ? (
                <ChevronDown size={14} className="text-ink-muted shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-ink-muted shrink-0" />
              )}

              <span
                className={clsx(
                  "text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0 border",
                  tc.priority === "Critical" &&
                    "bg-err/10 text-err border-err/20",
                  tc.priority === "High" &&
                    "bg-warn/10 text-warn border-warn/20",
                  tc.priority === "Medium" &&
                    "bg-accent-dim text-accent-text border-accent/20",
                  tc.priority === "Low" &&
                    "bg-surface-overlay text-ink-muted border-subtle",
                )}
              >
                {tc.priority}
              </span>

              <span className="flex-1 text-sm truncate text-ink-secondary">
                {tc.name}
              </span>

              <span className="text-[11px] text-ink-muted tabular-nums">
                {tc.steps.length} steps
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(i);
                }}
                className="p-1 rounded transition-colors hover:bg-err/10"
              >
                <Trash2 size={13} className="text-ink-muted hover:text-err" />
              </button>
            </div>

            {/* Expanded Content */}
            {expandedIndex === i && (
              <div className="px-4 pb-4 border-t border-subtle pt-3 space-y-4 animate-fade">
                {/* Objective */}
                <div>
                  <h4 className="text-[10px] font-medium text-ink-muted uppercase tracking-wider mb-1">
                    Objective
                  </h4>
                  <p className="text-sm text-ink-secondary">{tc.objective}</p>
                </div>

                {/* Preconditions */}
                {tc.preconditions.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-medium text-ink-muted uppercase tracking-wider mb-1">
                      Preconditions
                    </h4>
                    <ul className="space-y-1">
                      {tc.preconditions.map((p, j) => (
                        <li
                          key={j}
                          className="flex gap-2 items-start text-sm text-ink-secondary"
                        >
                          <span className="mt-1 text-accent/50">•</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Steps */}
                <div>
                  <h4 className="text-[10px] font-medium text-ink-muted uppercase tracking-wider mb-2">
                    Test Steps
                  </h4>
                  <div className="space-y-2">
                    {tc.steps.map((step) => (
                      <div
                        key={step.step_number}
                        className="flex gap-3 p-2 rounded-lg bg-surface-input"
                      >
                        <span className="text-[11px] font-mono tabular-nums text-accent/50 w-5 shrink-0 text-right mt-0.5">
                          {step.step_number}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm text-ink-secondary">
                            {step.action}
                          </p>
                          <p className="mt-1 text-xs text-ok/60">
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
                        className="text-[10px] px-2 py-0.5 rounded-md bg-surface-overlay text-ink-muted border border-subtle"
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
