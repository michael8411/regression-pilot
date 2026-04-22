import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactElement,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  label: React.ReactNode;
  children: ReactElement;
  side?: TooltipSide;
  delayMs?: number;
  disabled?: boolean;
}

const OFFSET = 8;

function computePosition(
  rect: DOMRect,
  tipRect: DOMRect,
  side: TooltipSide,
): { top: number; left: number } {
  let top = 0;
  let left = 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const place = (s: TooltipSide) => {
    switch (s) {
      case "top":
        top = rect.top - tipRect.height - OFFSET;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + OFFSET;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - OFFSET;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + OFFSET;
        break;
    }
  };

  place(side);

  const overflowRight = left + tipRect.width > vw - 4;
  const overflowLeft = left < 4;
  const overflowBottom = top + tipRect.height > vh - 4;
  const overflowTop = top < 4;

  if ((side === "right" && overflowRight) || (side === "left" && overflowLeft)) {
    place(side === "right" ? "left" : "right");
  }
  if ((side === "bottom" && overflowBottom) || (side === "top" && overflowTop)) {
    place(side === "bottom" ? "top" : "bottom");
  }

  left = Math.max(4, Math.min(left, vw - tipRect.width - 4));
  top = Math.max(4, Math.min(top, vh - tipRect.height - 4));

  return { top, left };
}

interface TooltipContentProps {
  id: string;
  triggerRef: MutableRefObject<HTMLElement | null>;
  side: TooltipSide;
  children: React.ReactNode;
}

function TooltipContent({ id, triggerRef, side, children }: TooltipContentProps) {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;
    setPos(computePosition(trigger.getBoundingClientRect(), tip.getBoundingClientRect(), side));
  }, [side, triggerRef, children]);

  return (
    <div
      ref={tipRef}
      role="tooltip"
      id={id}
      className={cn(
        "fixed z-[9999] pointer-events-none",
        "px-2 py-1 rounded-md border border-muted",
        "bg-surface-elevated shadow-float",
        "text-[11px] text-ink",
        "animate-fade-in",
      )}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>
  );
}

type TriggerProps = {
  ref?: Ref<HTMLElement>;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onKeyDown?: (e: ReactKeyboardEvent) => void;
  "aria-describedby"?: string;
};

export function Tooltip({
  label,
  children,
  side = "bottom",
  delayMs = 300,
  disabled = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const id = useId();

  const show = () => {
    if (disabled) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(true), delayMs);
  };
  const hide = () => {
    window.clearTimeout(timerRef.current);
    setOpen(false);
  };

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const origProps = children.props as TriggerProps;

  const child = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const origRef = (children as unknown as { ref?: Ref<HTMLElement> }).ref;
      if (typeof origRef === "function") origRef(node);
      else if (origRef && "current" in origRef) {
        (origRef as MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      origProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      origProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      origProps.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      origProps.onBlur?.(e);
      hide();
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === "Escape") hide();
      origProps.onKeyDown?.(e);
    },
    "aria-describedby": open ? id : origProps["aria-describedby"],
  } as TriggerProps);

  if (!open || disabled) return child;

  return (
    <>
      {child}
      {createPortal(
        <TooltipContent id={id} triggerRef={triggerRef} side={side}>
          {label}
        </TooltipContent>,
        document.body,
      )}
    </>
  );
}
Tooltip.displayName = "Tooltip";
