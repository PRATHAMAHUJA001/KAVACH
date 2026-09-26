import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Eye, Lock, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useTheme } from "@/shared/lib/theme";
import { Button, Card, Input, Segmented, Skeleton, Tooltip } from "@/shared/ui";
import { api, ApiError } from "@/services/api";
import type { AuthContextDTO, AuthRoleDTO } from "@/services/api";

/**
 * Real sign-in at `/login`, rendered outside the AppShell.
 *
 * `POST /api/auth/login` opens a Snowflake session with the supplied credentials,
 * so a wrong password fails here with 401 rather than being waved through — and the
 * session that every later request runs on is the one whose masking policies apply.
 * The cookie is HttpOnly and set by the server, so the API client sends credentials.
 */

/** The short sign-in name for a persona, as the API reports it (e.g. "analyst"). */
function accountFor(r: { role: string; username?: string }): string {
  return r.username ?? r.role.toLowerCase().replace("kavach_", "");
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tour = params.get("tour") === "1";

  const [ctx, setCtx] = useState<AuthContextDTO | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  /** Sent to the server only when the visitor explicitly picked a persona. */
  const [role, setRole] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The context tells us the personas, whether a session already exists, and
  // whether Snowflake identified the visitor at the SPCS ingress.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c = await api.getAuthContext();
        if (cancelled) return;
        setCtx(c);
        // Pre-fill with whoever Snowflake says this is; they still confirm the password.
        if (c.ingress_user) setUsername(c.ingress_user);
        else if (c.profile) setUsername(c.profile.user_id);
      } catch {
        // Not fatal: the form still works, we just cannot show the persona cards.
        if (!cancelled) setCtx(null);
      } finally {
        if (!cancelled) setCtxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickRole = useCallback((r: AuthRoleDTO) => {
    setRole(r.role);
    setUsername(accountFor(r));
    setError(null);
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await api.login({ username: username.trim(), password, ...(role ? { role } : {}) });
        navigate(tour ? "/today?tour=1" : "/today", { replace: true });
      } catch (err) {
        // A 401 carries the server's own wording in `detail`, which ApiError puts on
        // `message`; anything without one is a transport problem.
        setError(err instanceof ApiError ? err.message : t("error.generic"));
        setSubmitting(false);
      }
    },
    [navigate, password, role, submitting, t, tour, username],
  );

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  return (
    <div className="min-h-screen bg-app">
      {/* ───────── top bar ───────── */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-4 px-6 sm:px-8">
          <Link to="/" className="flex items-center gap-3 rounded-control" aria-label="KAVACH">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg shadow-sm" aria-hidden>
              <ShieldCheck className="size-5" strokeWidth={2} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-[1.0625rem] font-bold tracking-tight text-fg">KAVACH</span>
              <span className="block truncate text-small text-muted">{t("shell.tagline")}</span>
            </span>
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
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-12 sm:px-8 lg:py-16">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10">
          {/* ───────── personas ───────── */}
          <section aria-labelledby="login-personas" className="order-2 lg:order-1">
            <h2 id="login-personas" className="font-display text-h1 font-semibold text-fg">
              {t("login.personas.title")}
            </h2>
            <p className="mt-1.5 text-body text-muted">{t("login.personas.subtitle")}</p>

            <ul className="mt-6 space-y-3">
              {ctxLoading &&
                [0, 1, 2, 3].map((i) => (
                  <li key={i}>
                    <Skeleton className="h-[86px] rounded-card" />
                  </li>
                ))}
              {!ctxLoading &&
                (ctx?.roles ?? []).map((r) => {
                  const selected = role === r.role;
                  return (
                    <li key={r.role}>
                      <button
                        type="button"
                        onClick={() => pickRole(r)}
                        aria-pressed={selected}
                        className={cn(
                          "group w-full rounded-card border bg-surface p-4 text-left shadow-card",
                          "transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-px hover:shadow-card-hover",
                          selected ? "border-brand ring-4 ring-brand/15" : "border-border hover:border-border-strong",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
                              selected ? "bg-brand text-brand-fg" : r.readOnly ? "bg-info-soft text-info" : "bg-brand-soft text-brand",
                            )}
                            aria-hidden
                          >
                            {r.readOnly ? <Eye className="size-[18px]" strokeWidth={1.75} /> : <UserRound className="size-[18px]" strokeWidth={1.75} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-h2 font-semibold text-fg">{r.name}</span>
                              {r.readOnly && (
                                <span className="inline-flex h-5 items-center rounded-full bg-info-soft px-2 text-small font-medium text-info">
                                  {t("login.readOnly")}
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-body text-muted">{r.blurb}</span>
                            <span className="mt-1.5 block font-mono text-small text-muted">{accountFor(r)}</span>
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              {!ctxLoading && !ctx && (
                <li className="rounded-card border border-border bg-surface-2 p-4 text-body text-muted">{t("login.personas.unavailable")}</li>
              )}
            </ul>

            <p className="mt-5 text-small text-muted">{t("login.personas.note")}</p>
          </section>

          {/* ───────── credentials ───────── */}
          <section aria-labelledby="login-heading" className="order-1 lg:order-2 lg:sticky lg:top-8">
            <Card className="p-7 sm:p-8">
              <h1 id="login-heading" className="font-display text-h1 font-semibold text-fg">
                {t("login.title")}
              </h1>
              <p className="mt-1.5 text-body text-muted">{tour ? t("login.subtitleTour") : t("login.subtitle")}</p>

              {/* Snowflake already knows who this is at the SPCS ingress. */}
              {ctx?.ingress_user && (
                <div className="mt-6 rounded-card border border-info/25 bg-info-soft/50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info" aria-hidden>
                      <ShieldCheck className="size-[18px]" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-fg">{t("login.ingress.title", { user: ctx.ingress_user })}</p>
                      <p className="mt-1 text-small text-muted">{t("login.ingress.body")}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
                <div>
                  <label htmlFor="login-username" className="mb-1.5 block text-body font-medium text-fg">
                    {t("login.username")}
                  </label>
                  <Input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    icon={<UserRound />}
                    placeholder={t("login.usernamePlaceholder")}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="mb-1.5 block text-body font-medium text-fg">
                    {t("login.password")}
                  </label>
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    icon={<Lock />}
                    placeholder={t("login.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                  />
                </div>

                {/* Announced the moment it appears; never a raw stack. */}
                {error && (
                  <div id="login-error" role="alert" className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft/50 p-3.5">
                    <AlertTriangle className="mt-0.5 size-[18px] shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
                    <p className="text-body text-fg">{error}</p>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={!canSubmit} loading={submitting}>
                  {submitting ? t("login.submitting") : t("login.submit")}
                  {!submitting && <ArrowRight />}
                </Button>
              </form>

              <p className="mt-5 text-small text-muted">{t("login.masking")}</p>
            </Card>

            <p className="mt-6 px-1 text-small text-muted">
              <span className="block font-medium text-fg">{t("shell.footer")}</span>
              <span className="mt-1 block">{t("landing.footerNote")}</span>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
