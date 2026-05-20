interface Props {
  title: string;
  subtitle?: string;
}

export function SettingsPaneHeader({ title, subtitle }: Props) {
  return (
    <header className="px-6 py-4 border-b border-subtle">
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 text-[11.5px] text-ink-muted">{subtitle}</p>
      )}
    </header>
  );
}
