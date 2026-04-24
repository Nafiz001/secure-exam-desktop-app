import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export function Spinner({ className, size = 16, label = "Loading" }) {
  return (
    <Loader2
      size={size}
      className={cn("animate-spin text-ink-muted", className)}
      aria-label={label}
      role="status"
    />
  );
}
