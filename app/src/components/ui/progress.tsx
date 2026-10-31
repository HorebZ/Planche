import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ProgressProps = ComponentProps<"div"> & {
  indeterminate?: boolean;
  value?: number;
};

export function Progress({ className, indeterminate, value, ...props }: ProgressProps) {
  const sliding = indeterminate ?? value == null;
  const clamped = Math.min(100, Math.max(0, value ?? 0));

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={sliding ? undefined : clamped}
      className={cn("h-0.5 w-48 overflow-hidden", !sliding && "rounded-[2px] bg-hover", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full rounded-[2px] bg-fg-3",
          sliding ? "w-2/5 animate-pl-slide" : "transition-[width]",
        )}
        style={sliding ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
}
