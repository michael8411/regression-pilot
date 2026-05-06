import { Markdown } from "@/components/assistant/lib/markdown";

export function DrawerDescription({ description }: { description: string }) {
  return (
    <section className="px-4 py-3 border-b border-subtle">
      <h3 className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-2">
        Description
      </h3>
      {description?.trim() ? (
        <div className="markdown-content text-[12px] text-ink-secondary leading-relaxed">
          <Markdown source={description} />
        </div>
      ) : (
        <p className="text-[12px] text-ink-faint">No description.</p>
      )}
    </section>
  );
}
