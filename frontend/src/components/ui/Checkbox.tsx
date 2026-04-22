import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Check, Minus } from "@/lib/icons";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange" | "size"> {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  size?: "sm" | "md";
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { checked, onChange, label, size = "md", indeterminate = false,
      disabled, className, ...rest },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current!, []);

    useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const box = (
      <span
        className={cn(
          "inline-flex items-center justify-center",
          "border transition-colors duration-fast ease-smooth",
          size === "sm" ? "h-3 w-3 rounded" : "h-3.5 w-3.5 rounded-sm",
          checked || indeterminate
            ? "bg-accent border-accent text-white"
            : "bg-surface-sunken border-muted",
          disabled && "opacity-40",
          "group-focus-within:ring-2 group-focus-within:ring-accent/40",
        )}
        aria-hidden
      >
        {indeterminate ? (
          <Minus size={size === "sm" ? 8 : 10} strokeWidth={3} />
        ) : checked ? (
          <Check size={size === "sm" ? 9 : 11} strokeWidth={3} />
        ) : null}
      </span>
    );

    return (
      <label
        className={cn(
          "group inline-flex items-center gap-2 cursor-pointer select-none",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <input
          ref={innerRef}
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          {...rest}
        />
        {box}
        {label && <span className="t-body text-ink">{label}</span>}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
