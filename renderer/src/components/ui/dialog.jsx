import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  showClose = true,
  size = "md",
  onOpenAutoFocus,
  ...props
}) {
  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
    "2xl": "max-w-4xl",
  }[size];

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm",
          "data-[state=open]:animate-fade-in"
        )}
      />
      <DialogPrimitive.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[92vw] -translate-x-1/2 -translate-y-1/2",
          sizeClass,
          "rounded-lg bg-surface shadow-lg border border-border",
          "data-[state=open]:animate-dialog-in focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-border/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, children, ...props }) {
  return (
    <div className={cn("px-6 pt-5 pb-3", className)} {...props}>
      {children}
    </div>
  );
}

export function DialogTitle({ className, children, ...props }) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base font-semibold text-ink", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Title>
  );
}

export function DialogDescription({ className, children, ...props }) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-ink-muted mt-1.5", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Description>
  );
}

export function DialogBody({ className, children, ...props }) {
  return (
    <div className={cn("px-6 py-3 text-sm text-ink", className)} {...props}>
      {children}
    </div>
  );
}

export function DialogFooter({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "px-6 py-4 flex items-center justify-end gap-2 border-t border-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
