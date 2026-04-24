import { forwardRef } from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { Tooltip } from "./tooltip";

const iconButtonStyles = cva(
  "inline-flex items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  {
    variants: {
      variant: {
        ghost: "text-ink-muted hover:text-ink hover:bg-border/50",
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "bg-surface border border-border text-ink hover:bg-bg hover:border-border-strong",
        danger: "text-danger hover:bg-danger-subtle",
        "danger-solid": "bg-danger text-white hover:bg-danger-hover",
      },
      size: {
        sm: "h-8 w-8",
        md: "h-9 w-9",
        lg: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  }
);

export const IconButton = forwardRef(function IconButton(
  {
    className,
    variant,
    size,
    children,
    "aria-label": ariaLabel,
    tooltip,
    type = "button",
    ...props
  },
  ref
) {
  if (!ariaLabel) {
    console.warn("IconButton requires an aria-label for accessibility.");
  }

  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel}
      className={cn(iconButtonStyles({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{btn}</Tooltip>;
  }
  return btn;
});
