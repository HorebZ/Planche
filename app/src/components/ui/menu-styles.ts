import { cva, type VariantProps } from "class-variance-authority";

export const menuContentClassName = [
	"z-50 flex min-w-[216px] origin-[var(--radix-popper-transform-origin)] animate-pl-in flex-col gap-px",
	"rounded-xl bg-elevated p-1 text-fg shadow-pop outline-none",
].join(" ");

export const menuItemVariants = cva(
	[
		"relative flex h-[30px] cursor-default select-none items-center gap-2 rounded-sm pr-1.5 pl-2 text-sm outline-none",
		"highlighted:bg-hover",
		"data-[disabled]:pointer-events-none data-[disabled]:text-fg-3 data-[disabled]:[&_svg]:text-fg-3",
		"[&_svg]:size-4 [&_svg]:shrink-0",
	],
	{
		variants: {
			variant: {
				default: "text-fg [&_svg]:text-fg-2",
				destructive: "text-danger [&_svg]:text-danger",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

export type MenuItemVariant = VariantProps<typeof menuItemVariants>["variant"];

export const menuLabelClassName = "px-2 py-1 font-semibold text-2xs text-fg-3";

export const menuSeparatorClassName = "-mx-1 my-[3px] h-px bg-line";

export const menuShortcutClassName = "ml-auto";

export const menuSubTriggerClassName = "data-[state=open]:bg-hover";
