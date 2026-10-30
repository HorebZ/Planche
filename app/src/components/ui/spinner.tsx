import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Spinner({
  size = 14,
  className,
  style,
  ...props
}: ComponentProps<"span"> & { size?: number }) {
  return (
    <span
      data-slot="spinner"
      aria-hidden
      style={{ width: size, height: size, ...style }}
      className={cn(
        "inline-block shrink-0 animate-pl-spin rounded-full border-[1.5px] border-line-strong border-t-current text-fg-2",
        className,
      )}
      {...props}
    />
  );
}
