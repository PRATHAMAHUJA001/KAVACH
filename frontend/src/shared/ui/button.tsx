import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium select-none " +
    "transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-out " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
    "disabled:pointer-events-none disabled:opacity-50 active:translate-y-px " +
    "[&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-fg shadow-sm hover:bg-brand-hover",
        secondary: "bg-surface text-fg border border-border shadow-sm hover:bg-surface-2 hover:border-border-strong",
        soft: "bg-brand-soft text-brand hover:bg-brand-soft/70",
        ghost: "text-fg hover:bg-surface-2",
        danger: "bg-danger text-white shadow-sm hover:opacity-90 dark:text-[#1a0606]",
        "danger-soft": "bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125",
        "ok-soft": "bg-ok-soft text-ok hover:brightness-95 dark:hover:brightness-125",
        link: "text-brand underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-small",
        md: "h-10 px-4 text-body",
        lg: "h-12 px-5 text-[0.9375rem]",
        icon: "size-10",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
