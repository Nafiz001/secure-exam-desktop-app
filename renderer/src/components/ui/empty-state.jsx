import { cn } from "../../lib/cn";

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-10 px-6 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg text-ink-subtle">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      {title ? (
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
      ) : null}
      {description ? (
        <p className="text-sm text-ink-muted max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
