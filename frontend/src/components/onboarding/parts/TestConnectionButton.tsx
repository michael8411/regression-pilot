import { useState } from "react";
import { Check, AlertTriangle } from "@/lib/icons";
import { Button } from "@/components/ui";

interface TestResult {
  ok: boolean;
  detail: string;
}

interface Props {
  label: string;
  beforeTest: () => Promise<void>;
  run: () => Promise<TestResult>;
  onSuccess: () => void;
}

type State = "idle" | "saving" | "testing" | "ok" | "err";

export function TestConnectionButton({ label, beforeTest, run, onSuccess }: Props) {
  const [state, setState] = useState<State>("idle");
  const [detail, setDetail] = useState<string | null>(null);

  const handleClick = async () => {
    setState("saving");
    setDetail(null);
    try {
      await beforeTest();
      setState("testing");
      const r = await run();
      setDetail(r.detail);
      if (r.ok) {
        setState("ok");
        onSuccess();
      } else {
        setState("err");
      }
    } catch (e: any) {
      setDetail(e?.message ?? "Failed");
      setState("err");
    }
  };

  return (
    <div className="flex items-center gap-3 mt-2">
      <Button
        variant="secondary"
        size="md"
        onClick={handleClick}
        loading={state === "saving" || state === "testing"}
      >
        {label}
      </Button>
      <span role="status" aria-live="polite" className="flex items-center gap-1 text-sm">
        {state === "ok" && (
          <span className="flex items-center gap-1 text-ok">
            <Check size={14} />
            {detail || "Connected"}
          </span>
        )}
        {state === "err" && (
          <span className="flex items-center gap-1 text-err">
            <AlertTriangle size={14} />
            {detail || "Failed"}
          </span>
        )}
      </span>
    </div>
  );
}
