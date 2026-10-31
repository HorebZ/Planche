import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type CardLabel = {
  name: string;
  color: string;
};

function githubColor(color: string) {
  if (color.startsWith("#")) {
    return color;
  }

  if (/^[0-9a-f]{3,8}$/i.test(color)) {
    return `#${color}`;
  }

  return color;
}

type LabelChipProps = ComponentProps<"span"> & CardLabel;

export function LabelChip({ name, color, className, ...props }: LabelChipProps) {
  return (
    <span
      data-slot="label-chip"
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm px-[5px] font-medium text-2xs text-fg-2 shadow-[inset_0_0_0_1px_var(--pl-border)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: githubColor(color) }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
