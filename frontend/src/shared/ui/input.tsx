import * as React from "react";
import { cn } from "@/shared/lib/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode; trailing?: React.ReactNode }
>(({ className, icon, trailing, ...props }, ref) => (
  <div className={cn("relative flex items-center", className)}>
    {icon && (
      <span className="pointer-events-none absolute left-3 text-muted [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">
        {icon}
      </span>
    )}
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-control border border-border bg-surface-2 px-3 text-body text-fg placeholder:text-muted",
        "transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-border-strong focus:border-brand focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        icon && "pl-10",
        trailing && "pr-16",
      )}
      {...props}
    />
    {trailing && <span className="absolute right-2">{trailing}</span>}
  </div>
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-control border border-border bg-surface-2 px-3 py-2.5 text-body text-fg placeholder:text-muted",
        "hover:border-border-strong focus:border-brand focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
