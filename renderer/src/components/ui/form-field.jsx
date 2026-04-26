import { cn } from "../../lib/cn";
import { Label } from "./label";

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-danger mt-1" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle mt-1">{hint}</p>
      ) : null}
    </div>
  );
}
