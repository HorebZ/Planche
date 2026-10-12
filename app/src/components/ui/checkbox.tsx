import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const boxClass = "inline-grid size-3.5 shrink-0 place-items-center rounded-xs";

function CheckGlyph() {
	return <Check className="size-3" strokeWidth={2.5} />;
}

export function CheckMark({ checked, className }: { checked: boolean; className?: string }) {
	return (
		<span
			data-slot="check-mark"
			className={cn(
				boxClass,
				checked ? "bg-accent text-accent-fg" : "shadow-[inset_0_0_0_1.5px_var(--pl-border-strong)]",
				className,
			)}
		>
			{checked ? <CheckGlyph /> : null}
		</span>
	);
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				boxClass,
				"border-0 bg-transparent p-0 text-accent-fg shadow-[inset_0_0_0_1.5px_var(--pl-border-strong)]",
				"transition-[background-color,box-shadow]",
				"focus-visible:shadow-[inset_0_0_0_1.5px_var(--pl-border-strong),0_0_0_2px_var(--pl-focus)]",
				"data-[state=checked]:bg-accent data-[state=checked]:shadow-none",
				"data-[state=checked]:focus-visible:shadow-[0_0_0_2px_var(--pl-bg),0_0_0_4px_var(--pl-focus)]",
				"disabled:pointer-events-none disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-items-center">
				<CheckGlyph />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}
