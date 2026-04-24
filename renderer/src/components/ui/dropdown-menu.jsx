import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuSeparator = function Separator({ className }) {
  return (
    <Menu.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
    />
  );
};

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-md",
          "data-[state=open]:animate-scale-in",
          className
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, inset, ...props }) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink",
        "focus:bg-border/50 focus:outline-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }) {
  return (
    <Menu.Label
      className={cn(
        "px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle",
        className
      )}
      {...props}
    />
  );
}
