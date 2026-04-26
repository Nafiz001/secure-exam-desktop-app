import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export const Textarea = forwardRef(function Textarea(
  { className, rows = 4, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "block w-full rounded-md bg-surface border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-subtle",
        "transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring focus:ring-offset-0",
        "disabled:opacity-60 disabled:cursor-not-allowed resize-y",
        className
      )}
      {...props}
    />
  );
});
