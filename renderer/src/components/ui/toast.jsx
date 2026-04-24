import { Toaster as SonnerToaster, toast } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-surface border border-border text-ink shadow-md rounded-md",
          title: "text-sm font-medium text-ink",
          description: "text-sm text-ink-muted",
          success: "border-success-subtle",
          error: "border-danger-subtle",
          warning: "border-warning-subtle",
        },
      }}
    />
  );
}

export { toast };
