import { Columns3, List, RefreshCw } from "lucide-react";
import { statusTone } from "@/board/statusTone";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { StatusSquare } from "@/components/ui/status";
import type { Board } from "@/ipc/bindings";
import type { ProjectLayout } from "./Toolbar";

export function Palette({
	open,
	onOpenChange,
	board,
	onSync,
	onLayoutChange,
	onOpenIssue,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	board: Board | null | undefined;
	onSync: () => void;
	onLayoutChange: (layout: ProjectLayout) => void;
	onOpenIssue: (id: string) => void;
}) {
	const run = (action: () => void) => {
		onOpenChange(false);
		action();
	};
	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<CommandInput placeholder="Search issues or run a command…" />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				<CommandGroup heading="Actions">
					<CommandItem onSelect={() => run(onSync)}>
						<RefreshCw className="size-4 text-fg-3" />
						Sync now
						<CommandShortcut>
							<Kbd>⌘R</Kbd>
						</CommandShortcut>
					</CommandItem>
					<CommandItem onSelect={() => run(() => onLayoutChange("board"))}>
						<Columns3 className="size-4 text-fg-3" />
						Show board
					</CommandItem>
					<CommandItem onSelect={() => run(() => onLayoutChange("list"))}>
						<List className="size-4 text-fg-3" />
						Show list
					</CommandItem>
				</CommandGroup>
				<CommandGroup heading="Issues">
					{board?.columns.flatMap((column) =>
						column.cards.map((card) => (
							<CommandItem
								key={card.item_id}
								value={`${card.item_id} ${card.kind === "redacted" ? "Redacted item" : card.title} ${"number" in card ? card.number : ""}`}
								onSelect={() => run(() => onOpenIssue(card.item_id))}
							>
								<StatusSquare status={statusTone(column.color, column.name)} />
								<span className="min-w-0 flex-1 truncate">
									{card.kind === "redacted" ? "Redacted item" : card.title}
								</span>
								{"number" in card ? <span className="text-fg-3 text-sm tabular-nums">#{card.number}</span> : null}
							</CommandItem>
						)),
					)}
				</CommandGroup>
			</CommandList>
			<div className="flex h-[38px] items-center gap-3 border-line border-t px-4 text-fg-3 text-sm">
				<span>
					<Kbd>↑↓</Kbd> Navigate
				</span>
				<span>
					<Kbd>↵</Kbd> Open
				</span>
				<span className="flex-1" />
				<Kbd>esc</Kbd>
			</div>
		</CommandDialog>
	);
}
