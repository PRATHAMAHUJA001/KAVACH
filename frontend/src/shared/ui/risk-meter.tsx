import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

export type RiskLevel = 1 | 2 | 3 | 4 | 5;

/** Map a 0–1 or 0–100 score onto the 5 bands. */
export function scoreToRiskLevel(score: number): RiskLevel {
  const s = score > 1 ? score / 100 : score;
  if (s >= 0.85) return 5;
  if (s >= 0.65) return 4;
  if (s >= 0.45) return 3;
  if (s >= 0.25) return 2;
  return 1;
}

const FILL: Record<RiskLevel, string> = {
  1: "bg-ok",
  2: "bg-ok",
  3: "bg-warn",
  4: "bg-danger",
  5: "bg-danger",
};
const TEXT: Record<RiskLevel, string> = {
  1: "text-ok",
  2: "text-ok",
  3: "text-warn",
  4: "text-danger",
  5: "text-danger",
};

/** Horizontal 5-segment bar + word. Used instead of raw scores. */
export function RiskMeter({
  level,
  size = "md",
  showLabel = true,
  className,
}: {
  level: RiskLevel;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const word = t(`risk.${level}`);
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      role="img"
      aria-label={`${t("risk.label")}: ${word} (${level}/5)`}
    >
      <span className="flex items-center gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn(
              "rounded-full transition-colors",
              size === "sm" ? "h-1.5 w-3" : "h-2 w-4",
              i <= level ? FILL[level] : "bg-border",
            )}
          />
        ))}
      </span>
      {showLabel && (
        <span className={cn("font-semibold", size === "sm" ? "text-small" : "text-body", TEXT[level])} aria-hidden>
          {word}
        </span>
      )}
    </span>
  );
}
