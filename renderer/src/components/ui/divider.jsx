import { cn } from "../../lib/cn";

export function Divider({ className, orientation = "horizontal" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "w-px h-full",
        className
      )}
    />
  );
}
