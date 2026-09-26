import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye, LogOut, Moon, Presentation, Search, Sun, UserRound } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useTheme } from "@/shared/lib/theme";
import { usePresentation } from "@/shared/lib/presentation";
import {
  Button,
  DemoDataChip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Segmented,
  Skeleton,
  Tooltip,
} from "@/shared/ui";
import { api, USE_MOCKS } from "@/services/api";
import { useSession } from "@/features/session";

const DEMO_ROLES = [
  ["analyst", "KAVACH_ANALYST"],
  ["reviewer", "KAVACH_REVIEWER"],
  ["admin", "KAVACH_ADMIN"],
] as const;

function RoleChip() {
  const { t } = useTranslation();
  const { me, readOnly } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  if (!me) return <Skeleton className="h-8 w-28 rounded-full" />;
  const Icon = readOnly ? Eye : UserRound;

  // Closing the session server-side drops the Snowflake session behind it, so the
  // next visitor has to sign in again rather than inheriting this role.
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await api.logout();
    } catch {
      // Even if the call fails, send them to the sign-in page rather than
      // leaving them in a half-signed-out state.
    }
    window.location.assign("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-small font-semibold transition-colors",
          readOnly ? "border-info/30 bg-info-soft text-info" : "border-border bg-surface text-fg hover:bg-surface-2",
        )}
      >
        <Icon className="size-4" strokeWidth={2} aria-hidden />
        {t(`shell.role.${me.role}`)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 py-2">
          <p className="font-semibold text-fg">{me.name}</p>
          <p className="truncate text-small text-muted">{me.email}</p>
        </div>
        {USE_MOCKS && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("shell.demoSignIn")}</DropdownMenuLabel>
            {DEMO_ROLES.map(([param, role]) => (
              <DropdownMenuItem
                key={role}
                onSelect={() => {
                  const u = new URL(window.location.href);
                  u.searchParams.set("role", param);
                  window.location.assign(u.toString());
                }}
              >
                <span className="flex-1">{t(`shell.role.${role}`)}</span>
                {me.role === role && <Check aria-hidden />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            // Keep the menu mounted while the request is in flight.
            e.preventDefault();
            void signOut();
          }}
        >
          <LogOut aria-hidden />
          <span className="flex-1">{signingOut ? t("shell.signingOut") : t("shell.signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar({ title, subtitle, onSearch }: { title: string; subtitle: string; onSearch: () => void }) {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const { presenting, toggle: togglePresenting } = usePresentation();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-app/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-8">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-h1 font-semibold text-fg">{title}</h1>
          <p className="truncate text-small text-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onSearch}
          className="flex h-9 w-36 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-3 text-body text-muted shadow-sm transition-colors hover:border-border-strong hover:text-fg 2xl:w-72"
          aria-label={t("shell.search")}
          aria-keyshortcuts="/"
        >
          <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex-1 truncate text-left">
            <span className="2xl:hidden">{t("shell.searchShort")}</span>
            <span className="hidden 2xl:inline">{t("shell.search")}</span>
          </span>
          <Kbd>/</Kbd>
        </button>
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
        <div className="flex items-center gap-1">
          <Tooltip content={`${t("shell.presentation")} (P)`}>
            <Button
              variant={presenting ? "soft" : "ghost"}
              size="icon-sm"
              onClick={togglePresenting}
              aria-pressed={presenting}
              aria-label={t("shell.presentation")}
              aria-keyshortcuts="p"
            >
              <Presentation />
            </Button>
          </Tooltip>
          <Tooltip content={theme === "dark" ? t("shell.light") : t("shell.dark")}>
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`${t("shell.theme")}: ${theme === "dark" ? t("shell.dark") : t("shell.light")}`}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </Tooltip>
        </div>
        {USE_MOCKS && <DemoDataChip />}
        <RoleChip />
      </div>
    </header>
  );
}
