import { openUrl } from "@tauri-apps/plugin-opener";
import { Columns3, Link, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export type ProjectLayout = "board" | "list";
type ToolbarProps = {
	board: Board | null | undefined;
	project: ProjectMeta | null | undefined;
	status: SyncStatus | undefined;
	onSelectView: (viewId: ViewId) => void;
	layout: ProjectLayout;
	onLayoutChange: (layout: ProjectLayout) => void;
	onSearch: () => void;
};

export function Toolbar({ board, project, status, onSelectView, layout, onLayoutChange, onSearch }: ToolbarProps) {
	const busy = busyLabel(status, !board);
	const boardViews = project?.views.filter((v) => v.layout === "Board") ?? [];
	const currentView = project?.views.find((v) => v.number === board?.view?.number);
	const count = board?.columns.reduce((n, c) => n + c.cards.length, 0) ?? 0;
	return (
		<header className="shrink-0">
			<div data-tauri-drag-region className="flex h-12 items-center gap-2 pr-3 pl-[18px]">
				{board ? (
					<>
						<span aria-hidden className="size-2.5 rounded-[3px] bg-accent" />
						<DropdownMenu>
							<DropdownMenuTrigger className="flex h-7 items-center gap-2 rounded-md px-0.5 font-medium outline-none hover:bg-hover focus-visible:shadow-ring">
								{board.project.title}
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-[240px]">
								<DropdownMenuLabel>Project views</DropdownMenuLabel>
								<DropdownMenuRadioGroup value={currentView?.id} onValueChange={onSelectView}>
									{boardViews.map((view) => (
										<DropdownMenuRadioItem key={view.id} value={view.id}>
											{view.name}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</>
				) : (
					<Skeleton className="h-3 w-[140px] rounded-xs" />
				)}
				<span className="flex-1" />
				<SyncIndicator
					state={busy ? "busy" : status?.state.type === "offline" ? "offline" : "idle"}
					label={busy ?? undefined}
				/>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Open project on GitHub"
					disabled={!board}
					onClick={() => board && openUrl(board.project.url)}
					className="size-7 text-fg-3"
				>
					<Link className="size-4" />
				</Button>
			</div>
			<div className="flex h-[42px] items-center gap-1.5 pr-3 pl-4">
				<fieldset aria-label="Project layout" className="flex gap-1.5">
					{(
						[
							{ id: "board", label: "Board", Icon: Columns3 },
							{ id: "list", label: "List", Icon: List },
						] as const
					).map(({ id, label, Icon }) => (
						<button
							key={id}
							type="button"
							aria-pressed={layout === id}
							onClick={() => onLayoutChange(id)}
							className={`flex h-7 items-center gap-1.5 rounded-full px-3 font-medium focus-visible:shadow-ring ${layout === id ? "bg-active" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--pl-border-strong)] hover:bg-hover"}`}
						>
							<Icon className="size-[15px] text-fg-3" />
							{label}
						</button>
					))}
				</fieldset>
				<span className="flex-1" />
				<span className="mr-2 text-[12px] text-fg-3 tabular-nums">{count} issues</span>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Search issues ⌘K"
					onClick={onSearch}
					className="size-[30px] rounded-full shadow-[inset_0_0_0_1px_var(--pl-border-strong)]"
				>
					<Search className="size-4" />
				</Button>
			</div>
		</header>
	);
}
