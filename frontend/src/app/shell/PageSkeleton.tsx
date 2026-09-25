import { Skeleton } from "@/shared/ui";

/** Generic page-shaped placeholder while a screen's code loads. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}
