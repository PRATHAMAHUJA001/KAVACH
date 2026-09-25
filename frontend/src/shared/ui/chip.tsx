import { cn } from "@/shared/lib/cn";
import { toneSoft, type Tone } from "./tone";

/** Small neutral/soft label chip (typology, channel, "Synthetic circular"). */
export function Chip({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-small font-medium",
        "[&_svg]:size-3.5 [&_svg]:stroke-2",
        toneSoft[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
