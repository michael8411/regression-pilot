import { useState, type ReactNode } from "react";
import {
  AIShimmer,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  IconButton,
  Kbd,
  KbdPill,
  PriorityPill,
  SectionLabel,
  Segmented,
  Spinner,
  StatusDot,
  Toggle,
  Tooltip,
} from "@/components/ui";
import { hueFrom, initialsFrom } from "@/lib/avatar";
import {
  Bug,
  Copy,
  Filter,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
} from "@/lib/icons";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="t-label mb-3">{title}</h2>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-surface-elevated p-4">
        {children}
      </div>
    </section>
  );
}

function alex() {
  const name = "Alex Rivera";
  return { initials: initialsFrom(name), hue: hueFrom("alex@example.com"), label: name };
}
function jordan() {
  const name = "Jordan Kim";
  return { initials: initialsFrom(name), hue: hueFrom("jordan@example.com"), label: name };
}
function priya() {
  const name = "Priya Shah";
  return { initials: initialsFrom(name), hue: hueFrom("priya@example.com"), label: name };
}

export default function LibraryPreview() {
  const [checked1, setChecked1] = useState(false);
  const [checked2, setChecked2] = useState(true);
  const [indeterminate, setIndeterminate] = useState(true);
  const [toggle1, setToggle1] = useState(false);
  const [toggle2, setToggle2] = useState(true);
  const [seg, setSeg] = useState<"all" | "open" | "done">("all");
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-surface-base px-8 py-6 text-ink">
      <header className="mb-6">
        <h1 className="t-h1 mb-1">Component Library Preview</h1>
        <p className="text-sm text-ink-muted">
          Dev-only — every primitive in every variant. Append <code className="mono">?dev=library</code> to the URL to load.
        </p>
      </header>

      <Section title="Button — variants">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ai" leading={<Sparkles size={14} />}>AI</Button>
      </Section>

      <Section title="Button — sizes">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </Section>

      <Section title="Button — leading / trailing / kbd / loading / disabled">
        <Button leading={<Plus size={14} />}>Add</Button>
        <Button trailing={<Send size={14} />}>Send</Button>
        <Button kbd="Mod+K">Search</Button>
        <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>
          Click to load
        </Button>
        <Button disabled>Disabled</Button>
        <Button fullWidth variant="secondary">Full width</Button>
      </Section>

      <Section title="IconButton — variants & sizes">
        <IconButton aria-label="Search" tooltip="Search" icon={<Search />} />
        <IconButton aria-label="Filter" tooltip="Filter" variant="neutral" icon={<Filter />} />
        <IconButton aria-label="Delete" tooltip="Delete" variant="danger" icon={<Trash2 />} />
        <IconButton aria-label="AI" tooltip="AI action" variant="ai" icon={<Sparkles />} />
        <IconButton aria-label="Active" tooltip="Active" active icon={<Settings />} />
        <IconButton aria-label="Small" tooltip="Small" size="sm" icon={<Copy />} />
        <IconButton aria-label="Medium" tooltip="Medium" size="md" icon={<Copy />} />
        <IconButton aria-label="Large" tooltip="Large" size="lg" icon={<Copy />} />
      </Section>

      <Section title="Checkbox">
        <Checkbox checked={checked1} onChange={setChecked1} label="Unchecked → check me" />
        <Checkbox checked={checked2} onChange={setChecked2} label="Checked" />
        <Checkbox
          checked={false}
          indeterminate={indeterminate}
          onChange={() => setIndeterminate(!indeterminate)}
          label="Indeterminate"
        />
        <Checkbox checked={false} onChange={() => {}} disabled label="Disabled" />
      </Section>

      <Section title="Toggle">
        <Toggle checked={toggle1} onChange={setToggle1} label="Off" />
        <Toggle checked={toggle2} onChange={setToggle2} label="On" />
        <Toggle checked={false} onChange={() => {}} size="sm" label="Small" />
        <Toggle checked={true} onChange={() => {}} size="md" label="Medium" />
        <Toggle checked={false} onChange={() => {}} disabled label="Disabled" />
      </Section>

      <Section title="Segmented">
        <Segmented
          aria-label="Filter"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "done", label: "Done" },
          ]}
        />
        <Segmented
          aria-label="Filter small"
          size="sm"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "Open", icon: <Bug size={12} /> },
            { value: "done", label: "Done", disabled: true },
          ]}
        />
      </Section>

      <Section title="Kbd / KbdPill">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <KbdPill keys="Mod K" />
        <KbdPill keys="Mod Shift P" />
        <KbdPill keys="Esc" />
      </Section>

      <Section title="Tooltip">
        <Tooltip label="Top (default)"><Button variant="secondary">Hover me</Button></Tooltip>
        <Tooltip label="Bottom" side="bottom"><Button variant="secondary">Bottom</Button></Tooltip>
        <Tooltip label="Left" side="left"><Button variant="secondary">Left</Button></Tooltip>
        <Tooltip label="Right" side="right"><Button variant="secondary">Right</Button></Tooltip>
      </Section>

      <Section title="Badge — tones & sizes">
        <Badge tone="neutral">Neutral</Badge>
        <Badge tone="accent">Accent</Badge>
        <Badge tone="ai" leading={<Sparkles size={10} />}>AI</Badge>
        <Badge tone="ok">OK</Badge>
        <Badge tone="warn">Warn</Badge>
        <Badge tone="err">Err</Badge>
        <Badge tone="info">Info</Badge>
        <Badge tone="accent" size="sm">Small</Badge>
      </Section>

      <Section title="PriorityPill">
        <PriorityPill priority="Critical" />
        <PriorityPill priority="High" />
        <PriorityPill priority="Medium" />
        <PriorityPill priority="Low" />
        <PriorityPill priority="Critical" size="sm" />
      </Section>

      <Section title="StatusDot">
        <StatusDot tone="ok" />
        <StatusDot tone="warn" />
        <StatusDot tone="err" />
        <StatusDot tone="info" />
        <StatusDot tone="ai" />
        <StatusDot tone="muted" />
        <StatusDot tone="ok" pulse />
        <StatusDot tone="ai" size="md" />
      </Section>

      <Section title="Avatar">
        <Avatar a={alex()} size={20} />
        <Avatar a={alex()} size={24} />
        <Avatar a={alex()} size={28} />
        <Avatar a={jordan()} size={32} />
        <Avatar a={priya()} size={40} ring />
      </Section>

      <Section title="Spinner">
        <Spinner />
        <Spinner size={18} tone="ai" />
        <Spinner size={22} tone="ink" />
      </Section>

      <Section title="AIShimmer">
        <div className="flex flex-col gap-2 w-80">
          <AIShimmer width="60%" />
          <AIShimmer width="90%" />
          <AIShimmer width="40%" />
        </div>
      </Section>

      <Section title="Card">
        <div className="grid grid-cols-2 gap-4 w-full">
          <Card>
            <CardHeader>
              <span className="font-medium">Default card</span>
              <IconButton aria-label="More" size="sm" icon={<Settings />} />
            </CardHeader>
            <CardBody>
              <p className="text-sm text-ink-secondary">
                Cards group related content with an optional header, body, and footer.
              </p>
            </CardBody>
            <CardFooter>
              <Button variant="ghost" size="sm">Cancel</Button>
              <Button size="sm">Save</Button>
            </CardFooter>
          </Card>
          <Card elevated interactive>
            <CardHeader>
              <span className="font-medium">Elevated + interactive</span>
              <Badge tone="ai" leading={<Sparkles size={10} />}>AI</Badge>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-ink-secondary">
                Hover me — I shift surfaces and borders on interaction.
              </p>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="SectionLabel">
        <div className="w-full rounded-xl border border-subtle bg-surface-elevated">
          <SectionLabel trailing={<span className="tnum">12</span>}>Tickets</SectionLabel>
          <div className="px-5 pb-4 text-sm text-ink-secondary">Items go here.</div>
        </div>
      </Section>
    </div>
  );
}
