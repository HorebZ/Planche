import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full border-0 bg-line-strong p-0 transition-[background-color,box-shadow]",
        "focus-visible:shadow-[0_0_0_2px_var(--pl-bg),0_0_0_4px_var(--pl-focus)]",
        "data-[state=checked]:bg-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow-thumb transition-transform data-[state=checked]:translate-x-3 data-[state=checked]:bg-primary-fg"
      />
    </SwitchPrimitive.Root>
  );
}
