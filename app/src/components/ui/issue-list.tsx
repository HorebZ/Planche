import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import type { IssueCardData } from "@/components/ui/issue-card";
import { LabelChip } from "@/components/ui/label-chip";
import { type StatusKey, StatusSquare } from "@/components/ui/status";

export function IssueListGroup({
	name,
	status,
	items,
	onOpen,
}: {
	name: string;
	status: StatusKey;
	items: (IssueCardData & { id: string; pending?: boolean })[];
	onOpen: (id: string) => void;
}) {
	const [expanded, setExpanded] = useState(true);
	return (
		<section data-slot="issue-list-group">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				aria-expanded={expanded}
				className="flex h-[34px] w-full items-center gap-2 border-line border-b bg-hover px-4 text-left font-medium focus-visible:bg-active"
			>
				{expanded ? <ChevronDown className="size-3.5 text-fg-3" /> : <ChevronRight className="size-3.5 text-fg-3" />}
				<StatusSquare status={status} />
				{name}
				<span className="text-[12px] text-fg-3 tabular-nums">{items.length}</span>
			</button>
			{expanded
				? items.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => onOpen(item.id)}
							data-slot="issue-list-row"
							className="flex h-[38px] w-full items-center gap-2.5 border-line border-b px-4 text-left hover:bg-hover focus-visible:bg-active focus-visible:shadow-none"
						>
							<span className="w-4 shrink-0" />
							<span className="w-[68px] shrink-0 truncate text-[12px] text-fg-3 tabular-nums">
								{item.repo}
								{item.number != null ? `#${item.number}` : "Draft"}
							</span>
							<StatusSquare status={item.status ?? status} />
							<span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
							{item.pending ? <span className="text-warning text-xs">Pending</span> : null}
							<div className="flex max-w-1/3 gap-1 overflow-hidden">
								{item.labels.map((label) => (
									<LabelChip key={label.name} {...label} className="h-[22px] shrink-0 rounded-full" />
								))}
							</div>
							<div className="flex w-7 justify-end">
								<AvatarStack users={item.assignees} size={18} />
							</div>
						</button>
					))
				: null}
		</section>
	);
}
