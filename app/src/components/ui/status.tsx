import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const statusSquareVariants = cva("size-2 shrink-0 rounded-[2px]", {
	variants: {
		status: {
			backlog: "bg-status-backlog",
			todo: "bg-status-todo",
			doing: "bg-status-doing",
			review: "bg-status-review",
			done: "bg-status-done",
		},
	},
});

export type StatusKey = NonNullable<VariantProps<typeof statusSquareVariants>["status"]>;

export const statusLabels = {
	backlog: "Backlog",
	todo: "Todo",
	doing: "In progress",
	review: "In review",
	done: "Done",
} as const satisfies Record<StatusKey, string>;

type StatusSquareProps = ComponentProps<"span"> & { status: StatusKey };

export function StatusSquare({ status, className, ...props }: StatusSquareProps) {
	return <span data-slot="status-square" className={cn(statusSquareVariants({ status }), className)} {...props} />;
}

type StatusChipProps = ComponentProps<"span"> & {
	status: StatusKey;
	label?: string;
};

export function StatusChip({ status, label, className, ...props }: StatusChipProps) {
	return (
		<span data-slot="status-chip" className={cn("inline-flex items-center gap-[5px] text-sm", className)} {...props}>
			<StatusSquare status={status} />
			{label ?? statusLabels[status]}
		</span>
	);
}
