import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function ToggleGroup({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex gap-0.5 rounded-[7px] bg-hover p-0.5", className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-[22px] items-center justify-center whitespace-nowrap rounded-sm border-0 bg-transparent px-[9px] font-medium text-fg-2 text-sm",
        "transition-[background-color,box-shadow,color]",
        "hover:text-fg",
        "focus-visible:shadow-ring",
        "data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-card",
        "data-[state=on]:focus-visible:shadow-[var(--pl-shadow-card),0_0_0_2px_var(--pl-focus)]",
        "disabled:pointer-events-none disabled:text-fg-3 disabled:data-[state=on]:bg-active disabled:data-[state=on]:shadow-none",
        className,
      )}
      {...props}
    />
  );
}
