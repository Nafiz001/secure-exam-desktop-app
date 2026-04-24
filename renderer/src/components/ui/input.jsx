import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export const Input = forwardRef(function Input(
  { className, type = "text", leftIcon, rightIcon, containerClassName, ...props },
  ref
) {
  const hasLeft = Boolean(leftIcon);
  const hasRight = Boolean(rightIcon);

  const inputClasses = cn(
    "h-10 w-full rounded-md bg-surface border border-border text-sm text-ink placeholder:text-ink-subtle",
    "transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring focus:ring-offset-0",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    hasLeft ? "pl-10" : "pl-3",
    hasRight ? "pr-10" : "pr-3",
    className
  );

  if (!hasLeft && !hasRight) {
    return <input ref={ref} type={type} className={inputClasses} {...props} />;
  }

  return (
    <div className={cn("relative w-full", containerClassName)}>
      {hasLeft ? (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none flex items-center">
          {leftIcon}
        </span>
      ) : null}
      <input ref={ref} type={type} className={inputClasses} {...props} />
      {hasRight ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle flex items-center">
          {rightIcon}
        </span>
      ) : null}
    </div>
  );
});
