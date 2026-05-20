import { useState } from "react";
import { Eye, EyeOff, type IconComponent } from "@/lib/icons";

interface RightLink {
  label: string;
  icon: IconComponent;
  onClick: () => void;
}

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  masked?: boolean;
  rightLink?: RightLink;
  autoFocus?: boolean;
}

export function CredentialField({
  label,
  value,
  onChange,
  placeholder,
  masked,
  rightLink,
  autoFocus,
}: Props) {
  const [visible, setVisible] = useState(false);
  const inputType = masked && !visible ? "password" : "text";
  const RightIcon = rightLink?.icon;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="t-label">{label}</label>
        {rightLink && RightIcon && (
          <button
            type="button"
            onClick={rightLink.onClick}
            className="flex items-center gap-1 text-[11px] text-accent-text/70 hover:text-accent-text transition-colors"
          >
            {rightLink.label}
            <RightIcon size={11} />
          </button>
        )}
      </div>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="g-input text-sm pr-9"
          autoComplete="off"
          spellCheck={false}
        />
        {masked && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide" : "Show"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
