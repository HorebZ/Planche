import type { ComponentProps } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";

/** The bubble by the lifted card: where it will land. */
export function DragBubble({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="drag-bubble"
			className={cn(
				"pointer-events-none flex h-[22px] w-max items-center rounded-sm bg-fg px-2 font-medium text-[11.5px] text-bg shadow-pop",
				className,
			)}
			{...props}
		/>
	);
}

const keys = [
	{ keys: ["←", "→"], label: "Column" },
	{ keys: ["↑", "↓"], label: "Position" },
	{ keys: ["↵"], label: "Drop" },
	{ keys: ["esc"], label: "Cancel" },
];

/** The keys of a drag, at the bottom of the board while a card is lifted. */
export function DragHelpBar({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="drag-help-bar"
			className={cn(
				"flex h-[30px] w-max items-center gap-3 rounded-lg bg-elevated px-3 text-fg-2 text-sm shadow-pop",
				className,
			)}
			{...props}
		>
			{keys.map((key) => (
				<span key={key.label} className="flex items-center gap-[5px]">
					{key.keys.map((k) => (
						<Kbd key={k}>{k}</Kbd>
					))}
					{key.label}
				</span>
			))}
		</div>
	);
}
