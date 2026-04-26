import { cva } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badgeStyles = cva(
  "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-border/60 text-ink-muted",
        primary: "bg-primary-subtle text-primary-hover",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        danger: "bg-danger-subtle text-danger",
        info: "bg-info-subtle text-info",
        outline: "border border-border text-ink-muted",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
);

export function Badge({ className, variant, size, children, ...props }) {
  return (
    <span className={cn(badgeStyles({ variant, size }), className)} {...props}>
      {children}
    </span>
  );
}
