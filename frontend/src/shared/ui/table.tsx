import * as React from "react";
import { cn } from "@/shared/lib/cn";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto rounded-xl border border-border">
      <table className={cn("w-full border-collapse text-body", className)} {...props} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead {...p} className={cn("bg-surface-2", p.className)} />
);
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody {...p} className={cn("[&_tr:last-child]:border-0", p.className)} />
);
export const TR = (p: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr {...p} className={cn("border-b border-border transition-colors hover:bg-surface-2/60", p.className)} />
);
export const TH = ({ numeric, className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) => (
  <th
    scope="col"
    {...p}
    className={cn(
      "h-10 whitespace-nowrap px-4 text-left text-small font-semibold text-muted",
      numeric && "text-right",
      className,
    )}
  />
);
export const TD = ({ numeric, className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) => (
  <td {...p} className={cn("px-4 py-2.5 align-middle text-fg", numeric && "text-right tnum", className)} />
);
