import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export const Label = forwardRef(function Label(
  { className, required, children, ...props },
  ref
) {
  return (
    <label
      ref={ref}
      className={cn(
        "block text-sm font-medium text-ink mb-1.5",
        className
      )}
      {...props}
    >
      {children}
      {required ? <span className="text-danger ml-0.5">*</span> : null}
    </label>
  );
});
