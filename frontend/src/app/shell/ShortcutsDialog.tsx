import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from "@/shared/ui";
import { ROUTES } from "../routes";

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const rows: Array<[React.ReactNode, string]> = [
    ...ROUTES.map((r): [React.ReactNode, string] => [
      <span key={r.key} className="inline-flex items-center gap-1.5">
        <Kbd>G</Kbd>
        <span className="text-small text-muted">{t("shell.then")}</span>
        <Kbd>{r.hotkey.toUpperCase()}</Kbd>
      </span>,
      t(`shell.keys.${r.key}`),
    ]),
    [<Kbd key="s">/</Kbd>, t("shell.keys.search")],
    [<Kbd key="p">P</Kbd>, t("shell.keys.presentation")],
    [<Kbd key="n">→</Kbd>, t("shell.keys.next")],
    [<Kbd key="e">Esc</Kbd>, t("shell.keys.close")],
    [<Kbd key="h">?</Kbd>, t("shell.keys.help")],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(480px,calc(100vw-32px))]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        <DialogTitle>{t("shell.shortcuts")}</DialogTitle>
        <DialogDescription>{t("shell.shortcutsHint")}</DialogDescription>
        <dl className="mt-5 divide-y divide-border">
          {rows.map(([keys, label], i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-body text-fg">{label}</dt>
              <dd>{keys}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
