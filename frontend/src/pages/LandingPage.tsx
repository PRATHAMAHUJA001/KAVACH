import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  History,
  MessagesSquare,
  Moon,
  Network,
  ScrollText,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useTheme } from "@/shared/lib/theme";
import { useFormat } from "@/shared/lib/i18n";
import { Button, Card, Chip, Segmented, Tooltip, toneSoft, type Tone } from "@/shared/ui";

/**
 * Public front door at `/`. Rendered outside the AppShell and outside the
 * ColdStartGate: it is pure static copy, so there is no reason to make a visitor
 * wait on /healthz before they can read what the product does.
 *
 * Everything here is token-only (bg-surface, text-muted, brand-soft…) so the page
 * is correct in both themes without a single conditional colour.
 */

/** The six console screens, in sidebar order, so the story matches the app. */
const FEATURES: { key: string; icon: LucideIcon; tone: Tone }[] = [
  { key: "today", icon: CalendarClock, tone: "brand" },
  { key: "alerts", icon: Bell, tone: "danger" },
  { key: "ask", icon: MessagesSquare, tone: "info" },
  { key: "rings", icon: Network, tone: "warn" },
  { key: "rulebook", icon: ScrollText, tone: "ok" },
  { key: "timeMachine", icon: History, tone: "brand" },
];

/** Real counts from the deployed dataset; formatted with Indian digit grouping. */
const STATS: { key: string; value: number }[] = [
  { key: "alerts", value: 2879 },
  { key: "rules", value: 19 },
  { key: "rings", value: 9 },
  { key: "txns", value: 1_500_000 },
];

/** Logo at hero scale — same mark and wordmark as the sidebar, stepped up. */
function Wordmark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-fg shadow-card" aria-hidden>
        <ShieldCheck className="size-7" strokeWidth={2} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-display text-h1 font-bold tracking-tight text-fg">KAVACH</span>
        <span className="block truncate text-body text-muted">{t("shell.tagline")}</span>
      </span>
    </div>
  );
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const f = useFormat();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-app">
      {/* ───────── top bar ───────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-app/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-6 sm:px-8">
          <Link to="/" className="flex items-center gap-3 rounded-control" aria-label="KAVACH">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg shadow-sm" aria-hidden>
              <ShieldCheck className="size-5" strokeWidth={2} />
            </span>
            <span className="font-display text-[1.0625rem] font-bold tracking-tight text-fg">KAVACH</span>
          </Link>
          <div className="flex-1" />
          <Segmented
            size="sm"
            label={t("shell.language")}
            value={i18n.language === "hi" ? "hi" : "en"}
            onChange={(v) => void i18n.changeLanguage(v)}
            options={[
              { value: "en", label: "EN" },
              { value: "hi", label: "हिन्दी", lang: "hi" },
            ]}
          />
          <Tooltip content={theme === "dark" ? t("shell.light") : t("shell.dark")}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={`${t("shell.theme")}: ${theme === "dark" ? t("shell.dark") : t("shell.light")}`}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </Tooltip>
          <Button size="sm" variant="secondary" onClick={() => navigate("/login")}>
            {t("landing.signIn")}
          </Button>
        </div>
      </header>

      <main>
        {/* ───────── hero ───────── */}
        <section className="relative overflow-hidden border-b border-border">
          {/* Soft brand wash behind the headline, built from the theme tokens so it
              re-tints itself in dark mode instead of being a baked-in gradient. */}
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_-10%,var(--brand-soft),transparent_70%)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-[1200px] px-6 py-20 text-center sm:px-8 lg:py-28">
            <Wordmark className="justify-center" />
            <div className="mt-8 flex justify-center">
              <Chip tone="brand" icon={<ShieldCheck />}>
                {t("landing.eyebrow")}
              </Chip>
            </div>
            <h1 className="mx-auto mt-6 max-w-4xl font-display text-[2rem] font-bold leading-[1.15] tracking-tight text-fg sm:text-[2.75rem] lg:text-[3.25rem]">
              {t("landing.headline")}{" "}
              <span className="text-brand">{t("landing.headlineAccent")}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-story text-muted">{t("landing.subhead")}</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => navigate("/login")}>
                {t("landing.ctaPrimary")}
                <ArrowRight />
              </Button>
              <Button size="lg" variant="ghost" onClick={() => navigate("/login?tour=1")}>
                {t("landing.ctaSecondary")}
              </Button>
            </div>
          </div>
        </section>

        {/* ───────── credibility stats ───────── */}
        <section className="border-b border-border bg-surface/40" aria-labelledby="landing-stats">
          <div className="mx-auto max-w-[1200px] px-6 py-14 sm:px-8">
            <h2 id="landing-stats" className="label-caps text-center text-muted">
              {t("landing.stats.title")}
            </h2>
            <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
              {STATS.map((s) => (
                <Card key={s.key} className="p-6 text-center">
                  <dd className="font-display text-display font-bold tracking-tight text-fg tnum">{f.number(s.value)}</dd>
                  <dt className="mt-1 text-body text-muted">{t(`landing.stats.${s.key}`)}</dt>
                </Card>
              ))}
            </dl>
          </div>
        </section>

        {/* ───────── features ───────── */}
        <section className="border-b border-border" aria-labelledby="landing-features">
          <div className="mx-auto max-w-[1200px] px-6 py-20 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="landing-features" className="font-display text-[1.75rem] font-bold tracking-tight text-fg">
                {t("landing.features.title")}
              </h2>
              <p className="mt-3 text-story text-muted">{t("landing.features.subtitle")}</p>
            </div>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon, tone }) => (
                <li key={key}>
                  <Card interactive className="flex h-full flex-col p-6">
                    <span
                      className={cn("inline-flex size-11 items-center justify-center rounded-xl", toneSoft[tone])}
                      aria-hidden
                    >
                      <Icon className="size-[22px]" strokeWidth={1.75} />
                    </span>
                    <h3 className="mt-5 text-h2 font-semibold text-fg">{t(`landing.features.${key}.title`)}</h3>
                    <p className="mt-2 text-body text-muted">{t(`landing.features.${key}.desc`)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────── closing call to action ───────── */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-[1200px] px-6 py-16 sm:px-8">
            <Card className="overflow-hidden bg-surface-2 p-8 text-center sm:p-12">
              <h2 className="font-display text-[1.75rem] font-bold tracking-tight text-fg">{t("landing.closing.title")}</h2>
              <p className="mx-auto mt-3 max-w-2xl text-story text-muted">{t("landing.closing.body")}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" onClick={() => navigate("/login")}>
                  {t("landing.ctaPrimary")}
                  <ArrowRight />
                </Button>
                <Button size="lg" variant="secondary" onClick={() => navigate("/login?tour=1")}>
                  {t("landing.ctaSecondary")}
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* ───────── footer / synthetic-data disclaimer ───────── */}
      <footer className="mx-auto max-w-[1200px] px-6 py-12 sm:px-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <Wordmark />
          <p className="max-w-xl text-small text-muted">
            <span className="block font-medium text-fg">{t("shell.footer")}</span>
            <span className="mt-1 block">{t("landing.footerNote")}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
