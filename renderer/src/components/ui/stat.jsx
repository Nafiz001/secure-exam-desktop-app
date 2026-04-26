import { cn } from "../../lib/cn";

export function Stat({ icon: Icon, label, value, tone = "neutral", className }) {
  const toneBg = {
    neutral: "bg-bg text-ink-muted",
    primary: "bg-primary-subtle text-primary-hover",
    success: "bg-success-subtle text-success",
    warning: "bg-warning-subtle text-warning",
    danger: "bg-danger-subtle text-danger",
    info: "bg-info-subtle text-info",
  }[tone];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-surface p-4",
        className
      )}
    >
      {Icon ? (
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-md", toneBg)}>
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <div>
        <p className="text-xs text-ink-muted uppercase tracking-wide font-medium">
          {label}
        </p>
        <p className="text-xl font-semibold text-ink mt-0.5 tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}
