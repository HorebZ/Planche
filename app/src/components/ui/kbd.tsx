import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const kbdVariants = cva("inline-grid shrink-0 place-items-center rounded-xs font-mono text-2xs leading-none", {
	variants: {
		variant: {
			default: "bg-kbd text-fg-2",
			onAccent: "bg-white/22 text-current",
			onTooltip: "bg-[rgba(128,128,128,0.3)] text-current",
			plain: "bg-transparent text-fg-3",
		},
		size: {
			default: "h-[18px] min-w-[18px] px-1",
			sm: "h-4 min-w-4 px-[3px]",
			inline: "h-auto min-w-0 px-0",
		},
	},
	defaultVariants: { variant: "default", size: "default" },
});

export function Kbd({ className, variant, size, ...props }: ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
	return <kbd data-slot="kbd" className={cn(kbdVariants({ variant, size }), className)} {...props} />;
}
