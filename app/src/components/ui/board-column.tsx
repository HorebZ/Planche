import { MoreHorizontal, Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { type StatusKey, StatusSquare, statusLabels } from "@/components/ui/status";
import { cn } from "@/lib/cn";

type BoardColumnProps = ComponentProps<"section"> & {
	status: StatusKey;
	count: number;
	name?: string;
	dropTarget?: boolean;
	hiddenCount?: number;
	empty?: boolean;
};

const headerButtonClass = "size-[22px] rounded-sm text-fg-3 hover:text-fg [&_svg]:size-4";

export function BoardColumn({
	status,
	count,
	name,
	dropTarget = false,
	hiddenCount,
	empty = false,
	className,
	children,
	...props
}: BoardColumnProps) {
	return (
		<section
			data-slot="board-column"
			className={cn("relative flex w-column shrink-0 flex-col gap-[5px] rounded-xl bg-bg-sunken p-[5px]", className)}
			{...props}
		>
			<header className="flex h-7 items-center gap-[7px] pr-0.5 pl-1.5">
				<StatusSquare status={status} />
				<span className="font-semibold text-[12.5px]">{name ?? statusLabels[status]}</span>
				<span className="font-mono text-fg-3 text-xs">{count}</span>
				<span className="flex-1" />
				<Button type="button" variant="ghost" size="icon" aria-label="Add card" className={headerButtonClass}>
					<Plus />
				</Button>
				<Button type="button" variant="ghost" size="icon" aria-label="More" className={headerButtonClass}>
					<MoreHorizontal />
				</Button>
			</header>
			{empty ? (
				<div className="grid h-16 place-items-center rounded-[7px] text-[11.5px] text-fg-3 shadow-[inset_0_0_0_1px_var(--pl-border)]">
					Drop cards here
				</div>
			) : (
				children
			)}
			{hiddenCount != null && hiddenCount > 0 ? (
				<button
					type="button"
					className="h-6 rounded-md px-2 text-left text-fg-3 text-sm transition-colors hover:bg-hover hover:text-fg focus-visible:shadow-ring"
				>
					{hiddenCount} more
				</button>
			) : null}
			{dropTarget ? (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_var(--pl-accent)]"
				/>
			) : null}
		</section>
	);
}
