import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { usePortalContainer } from "@/components/ui/portal";
import { cn } from "@/lib/cn";

function TooltipProvider({ delayDuration = 500, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
	return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
	return <TooltipPrimitive.Root {...props} />;
}

function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipPortal(props: ComponentProps<typeof TooltipPrimitive.Portal>) {
	return <TooltipPrimitive.Portal container={usePortalContainer()} {...props} />;
}

function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPortal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				className={cn(
					"z-50 flex h-6 origin-[var(--radix-popper-transform-origin)] animate-pl-in items-center gap-1.5 rounded-sm bg-fg pr-1 pl-2 font-medium text-[11.5px] text-bg shadow-pop",
					className,
				)}
				{...props}
			/>
		</TooltipPortal>
	);
}

export { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger };
