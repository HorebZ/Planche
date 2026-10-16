import type { ComponentProps } from "react";
import { type Status, StatusGlyph } from "@/components/ui/planche-glyph";
import { cn } from "@/lib/cn";

// Legacy callers keep their keys while every status uses the v2 circular glyph.
export type StatusKey = Status | "backlog" | "doing";
export const statusLabels: Record<StatusKey, string> = {
	backlog: "Backlog",
	draft: "Draft",
	todo: "Todo",
	doing: "In progress",
	progress: "In progress",
	review: "In review",
	done: "Done",
	cancelled: "Cancelled",
	deleted: "Deleted",
};

export function glyphStatus(status: StatusKey): Status {
	return status === "backlog" ? "draft" : status === "doing" ? "progress" : status;
}

export function StatusSquare({ status, className, ...props }: ComponentProps<"span"> & { status: StatusKey }) {
	return (
		<span
			data-slot="status-square"
			className={cn("inline-flex size-3.5 shrink-0 items-center justify-center", className)}
			{...props}
		>
			<StatusGlyph status={glyphStatus(status)} title={statusLabels[status]} />
		</span>
	);
}

export function StatusChip({
	status,
	label,
	className,
	...props
}: ComponentProps<"span"> & { status: StatusKey; label?: string }) {
	return (
		<span data-slot="status-chip" className={cn("inline-flex items-center gap-[5px] text-sm", className)} {...props}>
			<StatusSquare status={status} />
			{label ?? statusLabels[status]}
		</span>
	);
}
