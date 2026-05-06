import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
}

export function StepShell({ title, description, children, footer }: Props) {
  return (
    <div className="flex flex-col h-full">
      <header className="mb-6">
        <h3 className="t-title text-ink">{title}</h3>
        {description && (
          <p className="t-meta text-ink-muted mt-1 max-w-prose">{description}</p>
        )}
      </header>
      <section className="flex-1 max-w-xl">{children}</section>
      <footer className="mt-6 pt-4 border-t border-subtle flex items-center justify-end gap-2">
        {footer}
      </footer>
    </div>
  );
}
