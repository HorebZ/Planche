import { ChevronDown } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncIndicator } from "@/components/ui/sync-indicator";
import type { Board, ProjectMeta, SyncStatus, ViewId } from "@/ipc/bindings";
import { busyLabel } from "./syncText";

type ToolbarProps = {
	board: Board | null | undefined;
	project: ProjectMeta | null | undefined;
	status: SyncStatus | undefined;
	onSelectView: (viewId: ViewId) => void;
};

/** The window's drag region: project and view, sync state, and who is on the board. */
export function Toolbar({ board, project, status, onSelectView }: ToolbarProps) {
	const loading = !board;
	const busy = busyLabel(status, loading);
	const offline = status?.state.type === "offline";
	const boardViews = project?.views.filter((v) => v.layout === "Board") ?? [];
	const currentView = project?.views.find((v) => v.number === board?.view?.number);
	return (
		<header
			data-tauri-drag-region
			className="flex h-toolbar shrink-0 items-center gap-2 border-line border-b pr-3 pl-3.5"
		>
			{board ? (
				<DropdownMenu>
					<DropdownMenuTrigger className="flex h-7 items-center gap-1.5 rounded-md px-1.5 outline-none hover:bg-hover focus-visible:shadow-ring">
						<span className="font-[650] text-md tracking-[-0.01em]">{board.project.title}</span>
						{board.view ? <span className="text-fg-3 text-sm">{board.view.name}</span> : null}
						<ChevronDown className="size-4 text-fg-3" aria-hidden />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[240px]">
						<DropdownMenuLabel>Board view</DropdownMenuLabel>
						<DropdownMenuRadioGroup value={currentView?.id} onValueChange={(id) => onSelectView(id)}>
							{boardViews.map((view) => (
								<DropdownMenuRadioItem key={view.id} value={view.id}>
									{view.name}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<Skeleton className="h-3 w-[140px] rounded-[4px]" />
			)}
			<span className="flex-1" />
			<SyncIndicator state={busy ? "busy" : offline ? "offline" : "idle"} label={busy ?? undefined} />
			{board ? <AvatarStack users={boardAssignees(board)} size={20} on="bg" className="pr-1" /> : null}
		</header>
	);
}

/** Everyone assigned to a card, most assigned first, at most four. */
function boardAssignees(board: Board) {
	const counts = new Map<string, { login: string; avatarUrl: string; cards: number }>();
	for (const card of board.columns.flatMap((c) => c.cards)) {
		if (card.kind === "redacted") continue;
		for (const user of card.assignees) {
			const seen = counts.get(user.login);
			counts.set(user.login, { login: user.login, avatarUrl: user.avatar_url, cards: (seen?.cards ?? 0) + 1 });
		}
	}
	return [...counts.values()].sort((a, b) => b.cards - a.cards).slice(0, 4);
}
