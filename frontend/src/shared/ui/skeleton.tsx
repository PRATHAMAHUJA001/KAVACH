import { cn } from "@/shared/lib/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} {...props} />;
}

/** Screen-reader announcement for a loading region. */
export function LoadingRegion({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
