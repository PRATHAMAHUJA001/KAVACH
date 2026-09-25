import { cn } from "@/shared/lib/cn";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-surface-2 px-1.5",
        "font-sans text-[0.6875rem] font-semibold text-muted shadow-[inset_0_-1px_0_var(--border)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
