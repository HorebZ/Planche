import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { usePortalContainer } from "@/components/ui/portal";
import { cn } from "@/lib/cn";

function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
	return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverPortal(props: ComponentProps<typeof PopoverPrimitive.Portal>) {
	return <PopoverPrimitive.Portal container={usePortalContainer()} {...props} />;
}

function PopoverContent({
	className,
	align = "start",
	sideOffset = 4,
	...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
	return (
		<PopoverPortal>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"z-50 w-[260px] origin-[var(--radix-popper-transform-origin)] animate-pl-in overflow-hidden rounded-lg bg-elevated text-fg shadow-pop outline-none",
					className,
				)}
				{...props}
			/>
		</PopoverPortal>
	);
}

function PopoverClose(props: ComponentProps<typeof PopoverPrimitive.Close>) {
	return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverPortal, PopoverTrigger };
