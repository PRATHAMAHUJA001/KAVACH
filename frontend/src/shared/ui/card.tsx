import * as React from "react";
import { cn } from "@/shared/lib/cn";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, DivProps & { interactive?: boolean }>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-border bg-surface shadow-card",
        interactive &&
          "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export function CardHeader({
  title,
  subtitle,
  action,
  className,
  titleAs: TitleTag = "h2",
  id,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  titleAs?: "h2" | "h3";
  id?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <TitleTag id={id} className="text-h2 font-semibold text-fg">
          {title}
        </TitleTag>
        {subtitle && <div className="mt-0.5 text-body text-muted">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export const CardBody = ({ className, ...props }: DivProps) => <div className={cn("p-6", className)} {...props} />;
