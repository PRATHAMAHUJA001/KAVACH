import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeftRight, Bell, CornerDownLeft, Loader2, Network, ScrollText, Search, UserRound, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "@/shared/lib/i18n";
import { Kbd } from "@/shared/ui";
import { useSearch, type SearchResult } from "@/services/api";
import { ROUTES } from "../routes";

const KIND_ICON: Record<SearchResult["kind"], LucideIcon> = { alert: Bell, account: UserRound, txn: ArrowLeftRight, ring: Network, rule: ScrollText };

function hrefFor(r: SearchResult): string {
  if (r.kind === "ring") return `/rings?ring=${encodeURIComponent(r.id)}`;
  if (r.kind === "rule") return `/rulebook?rule=${encodeURIComponent(r.id)}`;
  return `/alerts?case=${encodeURIComponent(r.alertId ?? r.id)}`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const itemCls =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-body text-fg outline-none data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand [&_svg]:stroke-[1.75]";

/** "/" opens this: jump to any screen, or find an alert, customer, account, transaction, ring or rule. */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 200);
  const results = useSearch(dq);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };
  const pages = ROUTES.filter((r) => !q || t(`nav.${r.key}`).toLowerCase().includes(q.toLowerCase()));
  const hits = dq.length >= 2 ? (results.data ?? []) : [];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-fade fixed inset-0 z-50 bg-scrim backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="anim-dialog fixed left-1/2 top-[14vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-overlay outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{t("shell.search")}</DialogPrimitive.Title>
          <Command shouldFilter={false} label={t("shell.search")} loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder={t("shell.searchHint")}
                className="h-14 flex-1 bg-transparent text-story text-fg placeholder:text-muted focus:outline-none"
              />
              {results.isFetching && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[min(420px,60vh)] overflow-y-auto p-2">
              {dq.length >= 2 && !results.isFetching && hits.length === 0 && (
                <Command.Empty className="px-3 py-8 text-center text-body text-muted">{t("shell.searchEmpty", { q: dq })}</Command.Empty>
              )}
              {hits.length > 0 && (
                <Command.Group heading={t("shell.results")} className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-muted">
                  {hits.map((r) => {
                    const Icon = KIND_ICON[r.kind];
                    const sub = r.kind === "alert" ? t(`typology.${r.subtitle}`, { defaultValue: r.subtitle }) : r.subtitle;
                    return (
                      <Command.Item key={`${r.kind}-${r.id}`} value={`${r.kind}-${r.id}`} onSelect={() => go(hrefFor(r))} className={itemCls}>
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" aria-hidden>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{f.text(r.title)}</span>
                          <span className="block truncate text-small text-muted">{sub}</span>
                        </span>
                        <span className="shrink-0 text-small text-muted">{t(`shell.kind.${r.kind}`)}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {pages.length > 0 && (
                <Command.Group heading={t("shell.goTo")} className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-muted">
                  {pages.map((r) => {
                    const Icon = r.icon;
                    return (
                      <Command.Item key={r.key} value={`page-${r.key}`} onSelect={() => go(r.path)} className={itemCls}>
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" aria-hidden>
                          <Icon className="size-4" />
                        </span>
                        <span className="flex-1 font-medium">{t(`nav.${r.key}`)}</span>
                        <span className="flex items-center gap-1 text-small text-muted" aria-hidden>
                          <Kbd>G</Kbd>
                          <Kbd>{r.hotkey.toUpperCase()}</Kbd>
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {dq.length > 0 && dq.length < 2 && <p className="px-3 py-2 text-small text-muted">{t("shell.searchMin")}</p>}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-border bg-surface-2/60 px-4 py-2 text-small text-muted" aria-hidden>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>
                {t("shell.goTo")}
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
