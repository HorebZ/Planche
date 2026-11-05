import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function ViewButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-7 rounded-full px-3 text-base text-fg-2 shadow-[inset_0_0_0_1px_var(--pl-border-strong)] aria-pressed:bg-active aria-pressed:text-fg aria-pressed:shadow-none [&_svg]:size-[15px] [&_svg]:text-fg-3",
        className,
      )}
      {...props}
    />
  );
}
