import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BellRing,
  Code2,
  Download,
  FileSearch,
  IndianRupee,
  Inbox,
  Moon,
  Network,
  Search,
  ShieldCheck,
  Sun,
  Table2,
  ThumbsDown,
  ThumbsUp,
  FileClock,
} from "lucide-react";
import { useTheme } from "@/shared/lib/theme";
import {
  Button,
  Card,
  CardHeader,
  CaseDrawer,
  CaseSection,
  Chip,
  CitationChip,
  CitationDrawer,
  DeadlineCountdown,
  DemoDataChip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  EvidenceSeal,
  Expander,
  ExplainPopover,
  FilterChips,
  Input,
  Kbd,
  KpiTile,
  KpiTileSkeleton,
  Money,
  ReadinessGauge,
  ReadinessGaugeSkeleton,
  ReasonBars,
  RiskMeter,
  SERIES,
  Segmented,
  Skeleton,
  SpeedBadge,
  StatusPill,
  Stepper,
  Switch,
  Slider,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Timeline,
  Tooltip,
  TrendChart,
  TrendChip,
  TrustBadge,
  toast,
  type CitationParagraph,
  type RiskLevel,
  type TimelineEvent,
} from "@/shared/ui";
import { cn } from "@/shared/lib/cn";

/** Demo data is pinned to the dataset's as-of date so deadlines render the same every time. */
const AS_OF = new Date("2026-09-24T10:00:00+05:30");
const hoursFromAsOf = (h: number) => new Date(AS_OF.getTime() + h * 3_600_000).toISOString();

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Typography"],
  ["buttons", "Buttons"],
  ["inputs", "Inputs"],
  ["status", "Status & badges"],
  ["kpi", "KpiTile"],
  ["gauge", "ReadinessGauge"],
  ["risk", "RiskMeter & Money"],
  ["citation", "Citations"],
  ["reasons", "ReasonBars"],
  ["timeline", "Timeline"],
  ["stepper", "Stepper"],
  ["evidence", "Evidence"],
  ["case", "CaseDrawer"],
  ["charts", "Charts"],
  ["states", "Empty, error, loading"],
  ["overlays", "Overlays"],
] as const;

const PARAGRAPH: CitationParagraph = {
  circularNo: "KAVACH/2024/01",
  paraNo: 2,
  issueDate: "11 Jan 2026",
  text: "All attempts of cash deposits in amounts ranging from Rs. 9,00,000 to Rs. 9,99,999 conducted more than three times in a rolling 30-day period by the same customer or linked accounts shall be flagged as potential structuring and reported as STR.",
  before: {
    paraNo: 1,
    text: "All Regulated Entities (REs) shall report Cash Transaction Reports (CTRs) for all cash transactions of value exceeding Rs. 10,00,000 (Rupees Ten Lakhs) or its equivalent in foreign currency, whether conducted as a single transaction or several transactions that appear to be connected, during a calendar month.",
  },
  after: {
    paraNo: 3,
    text: "For individual cash deposits, any single deposit exceeding Rs. 50,000 at a branch counter must be accompanied by PAN or Form 60 declaration.",
  },
};
const HIGHLIGHT = "conducted more than three times in a rolling 30-day period";

const REASONS = [
  { text: "Cash deposits just under ₹10 L — 4 times in 2 days", weight: 0.62 },
  { text: "Money left the account within 3 hours of each deposit", weight: 0.27 },
  { text: "Deposits made at 3 different branches in one city", weight: 0.11 },
];

const EVENTS: TimelineEvent[] = [
  { id: "e1", at: "2026-09-21T09:12:00+05:30", type: "login", title: "Logged in from a new phone", detail: "Pune" },
  { id: "e2", at: "2026-09-21T09:20:00+05:30", type: "new_beneficiary", title: "Added payee “R. Traders”" },
  { id: "e3", at: "2026-09-21T11:05:00+05:30", type: "cash_deposit", title: "Cash deposited at Kothrud branch", amount: 980000 },
  { id: "e4", at: "2026-09-22T10:40:00+05:30", type: "cash_deposit", title: "Cash deposited at Aundh branch", amount: 965000, suspicious: true },
  { id: "e5", at: "2026-09-22T13:02:00+05:30", type: "transfer_out", title: "Sent to R. Traders", amount: 1890000 },
  { id: "e6", at: "2026-09-22T13:03:00+05:30", type: "alert", title: "Alert raised by the structuring check" },
];

function trendData() {
  const out: Array<{ date: string; alerts: number; fraud: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(AS_OF.getTime() - i * 86_400_000);
    const base = 28 + Math.round(10 * Math.sin(i / 3.2) + (i % 7 === 0 ? 9 : 0) + (29 - i) * 0.25);
    out.push({ date: d.toISOString().slice(0, 10), alerts: base, fraud: Math.max(1, Math.round(base * 0.12 + Math.cos(i) * 1.5)) });
  }
  return out;
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4">
        <h2 className="text-h1 font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Demo({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-6", className)}>
      {label && <p className="mb-4 label-caps text-muted">{label}</p>}
      {children}
    </Card>
  );
}

function Swatch({ token, note }: { token: string; note?: string }) {
  const { theme } = useTheme();
  const [hex, setHex] = useState("");
  useEffect(() => {
    setHex(getComputedStyle(document.documentElement).getPropertyValue(token).trim());
  }, [token, theme]);
  return (
    <div className="flex items-center gap-3">
      <span className="size-10 shrink-0 rounded-xl border border-border" style={{ background: `var(${token})` }} aria-hidden />
      <div className="min-w-0">
        <p className="font-mono text-small text-fg">{token}</p>
        <p className="font-mono text-small uppercase text-muted">{hex}</p>
        {note && <p className="text-small text-muted">{note}</p>}
      </div>
    </div>
  );
}

export default function StyleguidePage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [citationOpen, setCitationOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "act" | "attention" | "ok">("all");
  const [threshold, setThreshold] = useState([9]);
  const [storyLang, setStoryLang] = useState<"en" | "hi">("en");
  const [sort, setSort] = useState("priority");
  const trend = useMemo(trendData, []);

  useEffect(() => {
    document.title = "Styleguide · KAVACH";
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-brand-fg" aria-hidden>
              <ShieldCheck className="size-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-h2 font-semibold leading-tight">KAVACH design system</h1>
              <p className="text-small text-muted">Every token and component, in every state.</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <DemoDataChip />
            <Segmented
              label="Language"
              value={i18n.language === "hi" ? "hi" : "en"}
              onChange={(v) => void i18n.changeLanguage(v)}
              options={[
                { value: "en", label: "EN" },
                { value: "hi", label: "हिन्दी", lang: "hi" },
              ]}
            />
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun className="size-4" />Light</span> },
                { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon className="size-4" />Dark</span> },
              ]}
            />
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-[1400px] overflow-x-auto px-8 pb-3 scrollbar-thin">
          <ul className="flex gap-1.5">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex h-7 items-center whitespace-nowrap rounded-full px-2.5 text-small font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-14 px-8 py-10">
        {/* ─────────────── Colour ─────────────── */}
        <Section id="colour" title="Colour" subtitle="Tokens only — nothing is hard-coded. Status colours always travel with an icon and a word.">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Demo label="Surfaces & text">
              <div className="grid gap-4">
                <Swatch token="--bg" note="App background" />
                <Swatch token="--surface" note="Cards, panels" />
                <Swatch token="--surface-2" note="Table headers, inputs" />
                <Swatch token="--border" note="1px borders" />
                <Swatch token="--text" note="Primary text" />
                <Swatch token="--text-muted" note="Secondary text" />
              </div>
            </Demo>
            <Demo label="Brand & status">
              <div className="grid grid-cols-2 gap-4">
                <Swatch token="--brand" />
                <Swatch token="--brand-soft" />
                <Swatch token="--ok" />
                <Swatch token="--ok-soft" />
                <Swatch token="--warn" />
                <Swatch token="--warn-soft" />
                <Swatch token="--danger" />
                <Swatch token="--danger-soft" />
                <Swatch token="--info" />
                <Swatch token="--info-soft" />
              </div>
            </Demo>
            <Demo label="Chart series (fixed order)">
              <div className="grid gap-4">
                <Swatch token="--chart-1" note="Alerts — always indigo" />
                <Swatch token="--chart-2" note="Teal" />
                <Swatch token="--chart-3" note="Amber" />
                <Swatch token="--chart-4" note="Confirmed fraud — always rose" />
                <Swatch token="--chart-5" note="Slate — baseline / “before”" />
              </div>
            </Demo>
          </div>
        </Section>

        {/* ─────────────── Typography ─────────────── */}
        <Section id="type" title="Typography" subtitle="Plus Jakarta Sans for headings, Inter for UI, Noto Sans Devanagari for Hindi. Tabular numbers everywhere.">
          <Demo>
            <div className="grid gap-5 lg:grid-cols-[180px_1fr] lg:items-baseline">
              <span className="label-caps text-muted">Display 36/44</span>
              <span className="font-display text-display font-bold tracking-tight">₹4.2 Cr at risk</span>
              <span className="label-caps text-muted">H1 24/32</span>
              <span className="font-display text-h1 font-semibold">Good morning. Here's today's compliance picture.</span>
              <span className="label-caps text-muted">H2 18/26</span>
              <span className="font-display text-h2 font-semibold">Needs your attention</span>
              <span className="label-caps text-muted">Story 16/26</span>
              <span className="text-story">
                Priya Traders deposited cash four times in two days, each time just under ₹10 lakh, then sent it on within hours.
              </span>
              <span className="label-caps text-muted">Body 14/22</span>
              <span className="text-body">3 reports are due within 48 hours. Two of them are for the same customer.</span>
              <span className="label-caps text-muted">Small 12/18</span>
              <span className="text-small text-muted">Updated 12 Sep 2026, 14:32 · Synthetic data</span>
              <span className="label-caps text-muted">Label 11 caps</span>
              <span className="label-caps text-muted">Needs attention</span>
              <span className="label-caps text-muted">Hindi</span>
              <span className="text-story" lang="hi">
                प्रिया ट्रेडर्स ने दो दिनों में चार बार नकद जमा किया, हर बार ₹10 लाख से थोड़ा कम।
              </span>
              <span className="label-caps text-muted">Numbers</span>
              <span className="tnum text-h2 font-semibold">1,24,500 · 98,765 · ₹12.4 L · ₹3.1 Cr · 82%</span>
            </div>
          </Demo>
        </Section>

        {/* ─────────────── Buttons ─────────────── */}
        <Section id="buttons" title="Buttons" subtitle="Buttons are verbs. One primary action per card.">
          <Demo>
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button>
                  <Download />
                  Download evidence pack
                </Button>
                <Button variant="secondary">Create draft report</Button>
                <Button variant="soft">Open case file</Button>
                <Button variant="ghost">Not fraud</Button>
                <Button variant="danger-soft">
                  <AlertTriangle />
                  Mark as fraud
                </Button>
                <Button variant="ok-soft">
                  <ShieldCheck />
                  Approve rule
                </Button>
                <Button variant="danger">Reject rule</Button>
                <Button variant="link">View all alerts</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button loading>Verifying…</Button>
                <Button disabled>Disabled</Button>
                <Tooltip content="Read-only access: reviewers can look but not change anything.">
                  <span tabIndex={0}>
                    <Button disabled>Mark as fraud</Button>
                  </span>
                </Tooltip>
                <Button size="icon" variant="secondary" aria-label="Helpful">
                  <ThumbsUp />
                </Button>
                <Button size="icon" variant="secondary" aria-label="Not helpful">
                  <ThumbsDown />
                </Button>
              </div>
            </div>
          </Demo>
        </Section>

        {/* ─────────────── Inputs ─────────────── */}
        <Section id="inputs" title="Inputs & controls">
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo label="Text">
              <div className="space-y-4">
                <Input icon={<Search />} placeholder="Search an alert, transaction or account ID" trailing={<Kbd>/</Kbd>} aria-label="Search" />
                <Input icon={<FileSearch />} placeholder="Why wasn't this flagged? Paste a transaction ID" aria-label="Why wasn't this flagged" />
                <Textarea rows={3} placeholder="Why are you rejecting this rule?" aria-label="Reason" />
              </div>
            </Demo>
            <Demo label="Choice">
              <div className="space-y-6">
                <FilterChips
                  label="Filter alerts"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All", count: 200 },
                    { value: "act", label: t("status.act"), count: 12 },
                    { value: "attention", label: t("status.attention"), count: 31 },
                    { value: "ok", label: t("status.ok"), count: 157 },
                  ]}
                />
                <div className="flex flex-wrap items-center gap-6">
                  <Segmented
                    label="Story language"
                    value={storyLang}
                    onChange={setStoryLang}
                    options={[
                      { value: "en", label: "English" },
                      { value: "hi", label: "हिन्दी", lang: "hi" },
                    ]}
                  />
                  <label className="inline-flex items-center gap-3 text-body">
                    <Switch defaultChecked aria-label="Presentation mode" />
                    Presentation mode
                  </label>
                  <span className="inline-flex items-center gap-1.5 text-small text-muted">
                    Press <Kbd>G</Kbd> <Kbd>A</Kbd> for Alerts · <Kbd>?</Kbd> for shortcuts
                  </span>
                </div>
                <div className="pb-6">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-body font-medium">Cash deposit limit</span>
                    <span className="font-display text-h2 font-semibold tnum">₹{threshold[0]} L</span>
                  </div>
                  <Slider
                    min={5}
                    max={12}
                    step={0.5}
                    value={threshold}
                    onValueChange={setThreshold}
                    marker={9}
                    markerLabel="Today: ₹9 L"
                    thumbLabel="Cash deposit limit in lakh"
                  />
                </div>
              </div>
            </Demo>
            <Demo label="Tabs & expanders" className="lg:col-span-2">
              <Tabs defaultValue="versions">
                <TabsList>
                  <TabsTrigger value="versions">Versions</TabsTrigger>
                  <TabsTrigger value="conflicts">
                    Conflicts
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-soft px-1.5 text-[0.6875rem] font-semibold text-danger">9</span>
                  </TabsTrigger>
                  <TabsTrigger value="health">Rule health</TabsTrigger>
                </TabsList>
                <TabsContent value="versions" className="space-y-3">
                  <Expander title="Show the data" icon={<Table2 />} meta="10 rows">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Branch</TH>
                          <TH numeric>High-risk alerts</TH>
                          <TH numeric>Money involved</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {[
                          ["Pune · Kothrud", 10, 42300000],
                          ["Nagpur · Sitabuldi", 7, 18750000],
                          ["Indore · Vijay Nagar", 7, 9120000],
                        ].map(([b, n, amt]) => (
                          <TR key={String(b)}>
                            <TD>{b}</TD>
                            <TD numeric>{n}</TD>
                            <TD numeric>
                              <Money amount={Number(amt)} focusable={false} />
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </Expander>
                  <Expander title="Show the SQL" icon={<Code2 />}>
                    <pre className="scrollbar-thin overflow-x-auto rounded-lg bg-surface-2 p-4 font-mono text-small text-fg">
                      {`SELECT a.branch_code, COUNT(DISTINCT al.alert_id) AS alert_count\nFROM CORE.ALERTS al JOIN CORE.ACCOUNTS a USING (account_id)\nWHERE al.severity = 'HIGH'\nGROUP BY 1 ORDER BY 2 DESC LIMIT 10;`}
                    </pre>
                  </Expander>
                </TabsContent>
                <TabsContent value="conflicts">
                  <p className="text-body text-muted">Two rules from different circulars check the same cash deposits.</p>
                </TabsContent>
                <TabsContent value="health">
                  <p className="text-body text-muted">20 rules · 5 approved · 9 waiting for review.</p>
                </TabsContent>
              </Tabs>
            </Demo>
          </div>
        </Section>

        {/* ─────────────── Status ─────────────── */}
        <Section id="status" title="Status & badges" subtitle="Icon + word + soft background. Trend chips are coloured by meaning, not direction.">
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo label="StatusPill">
              <div className="flex flex-wrap gap-3">
                <StatusPill status="ok" />
                <StatusPill status="attention" />
                <StatusPill status="act" />
                <StatusPill status="overdue" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill size="sm" status="ok" />
                <StatusPill size="sm" status="attention" />
                <StatusPill size="sm" status="act" />
                <StatusPill size="sm" status="overdue" />
              </div>
              <p className="mb-2 mt-6 label-caps text-muted">DeadlineCountdown</p>
              <div className="flex flex-wrap gap-2">
                <DeadlineCountdown dueAt={hoursFromAsOf(24 * 9)} now={AS_OF} />
                <DeadlineCountdown dueAt={hoursFromAsOf(24 * 3)} now={AS_OF} />
                <DeadlineCountdown dueAt={hoursFromAsOf(20)} now={AS_OF} />
                <DeadlineCountdown dueAt={hoursFromAsOf(-5)} now={AS_OF} />
              </div>
            </Demo>
            <Demo label="Badges, chips, trend">
              <div className="flex flex-wrap items-center gap-3">
                <TrustBadge kind="verified" />
                <TrustBadge kind="ai" />
                <DemoDataChip />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TrendChip deltaPct={12} meaning="bad" />
                <TrendChip deltaPct={-8} meaning="good" />
                <TrendChip deltaPct={18} meaning="good" suffix="more fraud caught" />
                <TrendChip deltaPct={0} meaning="neutral" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Chip>{t("typology.RAPID_PASSTHROUGH")}</Chip>
                <Chip tone="brand" icon={<Network />}>
                  In a mule ring
                </Chip>
                <Chip tone="info">UPI</Chip>
                <Chip tone="warn">New account</Chip>
              </div>
              <p className="mt-5 text-body">
                Readiness is 82 out of 100
                <ExplainPopover term="Readiness">{t("readiness.explain")}</ExplainPopover>
                and 3 alerts use a structuring check
                <ExplainPopover term="Structuring">
                  Splitting cash into several deposits that each stay just under the ₹10 lakh reporting limit, so none of them gets reported.
                </ExplainPopover>
              </p>
            </Demo>
          </div>
        </Section>

        {/* ─────────────── KPI ─────────────── */}
        <Section id="kpi" title="KpiTile" subtitle="Label → count-up number → one plain sentence → optional trend. The whole tile is clickable.">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label="New alerts"
              value={23}
              icon={<BellRing />}
              sentence="8 of them look serious enough to act on today."
              trend={{ deltaPct: 12, meaning: "bad" }}
              onClick={() => toast("Opening alerts")}
            />
            <KpiTile
              label="Money at risk"
              value={42_300_000}
              format="money"
              icon={<IndianRupee />}
              tone="danger"
              sentence="Across all open alerts that are not yet resolved."
              trend={{ deltaPct: -6, meaning: "good" }}
              onClick={() => toast("Opening alerts")}
            />
            <KpiTile
              label="Reports due in 48 hours"
              value={3}
              icon={<FileClock />}
              tone="warn"
              sentence="3 reports are due within 48 hours."
              onClick={() => toast("Opening reports")}
            />
            <KpiTile
              label="Active mule rings"
              value={5}
              icon={<Network />}
              tone="info"
              sentence="₹4.2 Cr moved through them this month."
              trend={{ deltaPct: 25, meaning: "bad" }}
              onClick={() => toast("Opening rings")}
            />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </div>
        </Section>

        {/* ─────────────── Gauge ─────────────── */}
        <Section id="gauge" title="ReadinessGauge" subtitle="Below 60 at risk · 60–80 needs work · above 80 healthy.">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <Demo className="flex justify-center">
              <ReadinessGauge value={45} reason="4 reports are overdue and 9 rules wait for approval." />
            </Demo>
            <Demo className="flex justify-center">
              <ReadinessGauge value={72} reason="2 reports are close to their deadline." />
            </Demo>
            <Demo className="flex justify-center">
              <ReadinessGauge value={88} reason="All reports are on time. 1 rule waits for approval." />
            </Demo>
            <Demo className="flex justify-center">
              <ReadinessGaugeSkeleton />
            </Demo>
          </div>
        </Section>

        {/* ─────────────── Risk & money ─────────────── */}
        <Section id="risk" title="RiskMeter & Money" subtitle="Never show a raw score. ₹ in lakh/crore; hover for the exact amount.">
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo label="RiskMeter">
              <div className="grid gap-3">
                {([1, 2, 3, 4, 5] as RiskLevel[]).map((l) => (
                  <div key={l} className="flex items-center gap-8">
                    <RiskMeter level={l} />
                    <RiskMeter level={l} size="sm" />
                  </div>
                ))}
              </div>
            </Demo>
            <Demo label="Money">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-body">
                {[4_850, 48_500, 9_65_000, 12_40_500, 98_76_543, 3_10_00_000, 42_30_00_000, 1_24_56_78_900].map((a) => (
                  <div key={a} className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
                    <Money amount={a} className="text-h2 font-semibold" />
                    <span className="text-small text-muted tnum">{a.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </Demo>
          </div>
        </Section>

        {/* ─────────────── Citations ─────────────── */}
        <Section id="citation" title="CitationChip" subtitle="Every AI claim points at the exact paragraph. Click to read it with the matching sentence highlighted.">
          <Demo>
            <div className="flex flex-wrap items-center gap-3">
              <CitationChip circularNo="KAVACH/2024/01" paraNo={2} onOpen={() => setCitationOpen(true)} />
              <CitationChip circularNo="KAVACH/2025/01" paraNo={2} onOpen={() => setCitationOpen(true)} />
              <CitationChip circularNo="KAVACH/2024/03" paraNo={4} onOpen={() => setCitationOpen(true)} />
            </div>
          </Demo>
          <CitationDrawer
            open={citationOpen}
            onOpenChange={setCitationOpen}
            citation={PARAGRAPH}
            paragraph={PARAGRAPH}
            highlight={HIGHLIGHT}
          />
        </Section>

        {/* ─────────────── Reasons ─────────────── */}
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-6">
          <Section id="reasons" title="ReasonBars" subtitle="Top 3 reasons in plain words, weighted.">
            <Demo>
              <ReasonBars reasons={REASONS} />
              <div className="mt-5 flex flex-wrap gap-2">
                <CitationChip circularNo="KAVACH/2024/01" paraNo={2} onOpen={() => setCitationOpen(true)} />
              </div>
            </Demo>
          </Section>
          <Section id="timeline" title="Timeline" subtitle="What happened, in order. The suspicious event stands out.">
            <Demo>
              <Timeline events={EVENTS} />
            </Demo>
          </Section>
        </div>

        {/* ─────────────── Stepper ─────────────── */}
        <Section id="stepper" title="Stepper" subtitle="Circular upload progress, with a live tick per step.">
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { label: "Step 2 in progress", current: 1 },
              { label: "Step 4 in progress", current: 3 },
              { label: "All done", current: 4 },
              { label: "Failed at step 2", current: 1, error: true },
            ].map((s) => (
              <Demo key={s.label} label={s.label}>
                <Stepper
                  current={s.current}
                  error={s.error}
                  steps={[
                    { key: "reading", label: t("stepper.reading") },
                    { key: "obligations", label: t("stepper.obligations") },
                    { key: "checks", label: t("stepper.checks") },
                    { key: "review", label: t("stepper.review") },
                  ]}
                />
              </Demo>
            ))}
          </div>
        </Section>

        {/* ─────────────── Evidence ─────────────── */}
        <Section id="evidence" title="Evidence seal" subtitle="Proof that the evidence pack hasn't been touched since it was made.">
          <div className="grid gap-6 lg:grid-cols-2">
            <EvidenceSeal state="verified" since="12 Sep, 14:32" fingerprint="094f9f500c7145f54783128b196e01727f3d6f7f0bea517d1c3a1464fed55879" />
            <EvidenceSeal state="changed" fingerprint="9261d52589bce1bdd1d9ff71eda03885edd294b2a01cf1958c2133d699e96017" />
            <EvidenceSeal state="unchecked" />
            <EvidenceSeal state="checking" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <SpeedBadge seconds={3.24} />
            <span className="text-small text-muted">Only ever shows the real measured time.</span>
          </div>
        </Section>

        {/* ─────────────── Case drawer ─────────────── */}
        <Section id="case" title="CaseDrawer" subtitle="640px right panel: sticky header with risk, deadline and the primary action; sticky footer with the rest.">
          <Demo>
            <Button onClick={() => setCaseOpen(true)}>Open a sample case file</Button>
          </Demo>
          <CaseDrawer
            open={caseOpen}
            onOpenChange={setCaseOpen}
            eyebrow={t("typology.STRUCTURING")}
            title="Priya Traders · 4 cash deposits just under ₹10 L"
            riskLevel={5}
            deadline={<DeadlineCountdown dueAt={hoursFromAsOf(20)} now={AS_OF} />}
            primaryAction={
              <Button size="sm">
                <Download />
                Download evidence
              </Button>
            }
            footer={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="danger-soft">
                  <AlertTriangle />
                  Mark as fraud
                </Button>
                <Button variant="ghost">Not fraud</Button>
                <div className="flex-1" />
                <Button variant="secondary">Verify evidence</Button>
                <Button variant="secondary">Create draft report</Button>
              </div>
            }
          >
            <div className="divide-y divide-border">
              <CaseSection
                title="The story"
                aside={
                  <Segmented
                    size="sm"
                    label="Story language"
                    value={storyLang}
                    onChange={setStoryLang}
                    options={[
                      { value: "en", label: "EN" },
                      { value: "hi", label: "हिन्दी", lang: "hi" },
                    ]}
                  />
                }
              >
                {storyLang === "en" ? (
                  <p className="text-story">
                    Priya Traders deposited cash four times in two days at three different branches. Each deposit was just under ₹10 lakh,
                    the amount that must be reported. Within hours, the money was sent to a payee added the same morning.
                  </p>
                ) : (
                  <p className="text-story" lang="hi">
                    प्रिया ट्रेडर्स ने दो दिनों में तीन अलग-अलग शाखाओं में चार बार नकद जमा किया। हर जमा ₹10 लाख से थोड़ा कम था — वही सीमा जिसकी रिपोर्ट
                    ज़रूरी है। कुछ ही घंटों में पैसा उसी सुबह जोड़े गए प्राप्तकर्ता को भेज दिया गया।
                  </p>
                )}
                <div className="mt-3">
                  <TrustBadge kind="ai" />
                </div>
              </CaseSection>
              <CaseSection title={t("reason.title")}>
                <ReasonBars reasons={REASONS} />
                <div className="mt-4">
                  <CitationChip circularNo="KAVACH/2024/01" paraNo={2} onOpen={() => setCitationOpen(true)} />
                </div>
              </CaseSection>
              <CaseSection title={t("timeline.title")}>
                <Timeline events={EVENTS} />
              </CaseSection>
            </div>
          </CaseDrawer>
        </Section>

        {/* ─────────────── Charts ─────────────── */}
        <Section id="charts" title="Charts" subtitle="Alerts are always indigo, confirmed fraud always rose. 2px lines, faint horizontal grid, ₹-aware tooltip.">
          <Card className="p-6">
            <CardHeader title="Alerts vs confirmed fraud" subtitle="Last 30 days" className="mb-4" />
            <TrendChart
              data={trend}
              xKey="date"
              caption="Daily alerts and confirmed fraud cases over the last 30 days"
              series={[
                { key: "alerts", label: "Alerts", color: SERIES.alerts },
                { key: "fraud", label: "Confirmed fraud", color: SERIES.fraud },
              ]}
            />
          </Card>
        </Section>

        {/* ─────────────── States ─────────────── */}
        <Section id="states" title="Empty, error, loading" subtitle="Every error says what happened and what to do next.">
          <div className="grid gap-6 lg:grid-cols-3">
            <Demo label="Empty">
              <EmptyState icon={Inbox} title={t("empty.noAlerts")} action={<Button variant="secondary">{t("empty.clearFilters")}</Button>} compact />
            </Demo>
            <Demo label="Error">
              <ErrorState onRetry={() => toast.success("Loaded again")} />
            </Demo>
            <Demo label="Loading (skeleton matches shape)">
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            </Demo>
          </div>
          <div className="mt-6">
            <ErrorState compact onRetry={() => toast.success("Loaded again")} message={t("error.offline")} />
          </div>
        </Section>

        {/* ─────────────── Overlays ─────────────── */}
        <Section id="overlays" title="Overlays" subtitle="Dialog, menu, tooltip and toast.">
          <Demo>
            <div className="flex flex-wrap items-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Reject rule…</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>Reject this rule?</DialogTitle>
                  <DialogDescription>It won't run on any transactions. You can bring it back from the Versions tab.</DialogDescription>
                  <Textarea className="mt-4" rows={3} placeholder="Why are you rejecting it?" aria-label="Reason" />
                  <div className="mt-5 flex justify-end gap-2">
                    <Button variant="ghost">Cancel</Button>
                    <Button variant="danger">Reject rule</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">Sort by</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Sort alerts</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                    <DropdownMenuRadioItem value="priority">Most urgent first</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="amount">Largest amount first</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Reset</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip content="Tooltips explain; they never hide required information.">
                <Button variant="secondary">Hover me</Button>
              </Tooltip>
              <Button variant="secondary" onClick={() => toast.success("Marked as fraud", { description: "The case moved to “Confirmed”. You can undo this for 10 seconds.", action: { label: "Undo", onClick: () => {} } })}>
                Show toast
              </Button>
            </div>
          </Demo>
        </Section>

        <footer className="border-t border-border pt-6 text-small text-muted">{t("common.syntheticData")}</footer>
      </main>
    </div>
  );
}
