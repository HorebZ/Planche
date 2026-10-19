import { GitMerge } from "lucide-react";
import { useEffect, useState } from "react";
import { focusCard } from "@/board/Card";
import { statusTone } from "@/board/statusTone";
import {
	CommandContext,
	CommandDialog,
	CommandEmpty,
	CommandFooter,
	CommandGroup,
	CommandHighlight,
	CommandHint,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { StatusSquare } from "@/components/ui/status";
import type { Board, Card } from "@/ipc/bindings";
import { commandFor, keysFor } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { cardRef } from "@/undo/inverse";
import { matchCards, type PaletteCommand } from "./commands";

type CommandPaletteProps = {
	board: Board | null;
	/** The selected card, which the palette acts on until ⌫ clears it. */
	card: Card | null;
	commands: PaletteCommand[];
};

/** Screen 4: ⌘K. Runs every action, and finds a card to select. */
export function CommandPalette({ board, card, commands }: CommandPaletteProps) {
	const open = useUi((s) => s.overlay?.type === "palette");
	const [query, setQuery] = useState("");
	const [withContext, setWithContext] = useState(true);
	useEffect(() => {
		if (!open) return;
		setQuery("");
		setWithContext(true);
	}, [open]);
	const target = withContext ? card : null;
	const ref = target ? cardRef(target) : "";
	const shown = commands.filter((c) => c.group === "commands" || target);
	const cards = matchCards(board, query);
	const close = () => useUi.getState().open(null);
	const run = (command: PaletteCommand) => {
		close();
		command.run();
	};
	const keys = (command: Parameters<typeof keysFor>[0]) => keysFor(command, "palette").join("");

	return (
		<CommandDialog
			open={open}
			onOpenChange={(next) => useUi.getState().open(next ? { type: "palette" } : null)}
			contentProps={{
				onCloseAutoFocus: (event) => {
					event.preventDefault();
					// The overlay that follows, such as the assignee picker, takes the focus instead.
					const { overlay, selectedId } = useUi.getState();
					if (!overlay && selectedId) focusCard(selectedId);
				},
			}}
			commandProps={{
				onKeyDown: (event) => {
					if (query) return;
					const command = commandFor(event.nativeEvent, "palette");
					if (command === "palette.clearContext" && target) {
						event.preventDefault();
						setWithContext(false);
					} else if (command === "help.open") {
						event.preventDefault();
						useUi.getState().open({ type: "help" });
					}
				},
			}}
		>
			<CommandInput
				value={query}
				onValueChange={setQuery}
				placeholder={target ? "Run an action or search…" : "Search or run…"}
				leading={
					target ? (
						<CommandContext>
							<StatusSquare
								status={
									target.kind === "draft"
										? "draft"
										: statusTone(
												board?.columns.find((c) => c.cards.some((x) => x.item_id === target.item_id))?.color ?? null,
												board?.columns.find((c) => c.cards.some((x) => x.item_id === target.item_id))?.name,
											)
								}
							/>
							{ref} {target.kind === "redacted" ? "Redacted item" : target.title}
						</CommandContext>
					) : undefined
				}
				trailing={<Kbd className="px-[5px] text-fg-3">esc</Kbd>}
			/>
			<CommandList>
				<CommandEmpty>No matches</CommandEmpty>
				{target ? (
					<CommandGroup heading="Change status">
						{shown
							.filter((c) => c.group === "status")
							.map((c) => (
								<PaletteRow key={c.value} command={c} query={query} onRun={run} />
							))}
					</CommandGroup>
				) : null}
				<CommandGroup heading="Commands" className="mt-1">
					{shown
						.filter((c) => c.group === "commands" || c.group === "card")
						.map((c) => (
							<PaletteRow key={c.value} command={c} query={query} onRun={run} />
						))}
				</CommandGroup>
				{cards.length > 0 ? (
					<CommandGroup heading="Issues" className="mt-1">
						{cards.map((c) => (
							<CardRow
								key={c.item_id}
								card={c}
								board={board as Board}
								query={query}
								onPick={() => {
									close();
									useUi.getState().select(c.item_id);
								}}
							/>
						))}
					</CommandGroup>
				) : null}
			</CommandList>
			<CommandFooter>
				<CommandHint keys={keys("palette.prev") + keys("palette.next")}>Navigate</CommandHint>
				<CommandHint keys={keys("palette.run")}>Apply</CommandHint>
				{target ? <CommandHint keys={keys("palette.clearContext")}>Clear context</CommandHint> : null}
				<span className="flex-1" />
				<CommandHint keys={keysFor("dialog.close").join("")}>Close</CommandHint>
			</CommandFooter>
		</CommandDialog>
	);
}

function PaletteRow({
	command,
	query,
	onRun,
}: {
	command: PaletteCommand;
	query: string;
	onRun: (command: PaletteCommand) => void;
}) {
	const Icon = command.icon;
	return (
		<CommandItem value={command.value} onSelect={() => onRun(command)}>
			{command.status ? <StatusSquare status={command.status} /> : <Icon className="size-[18px] text-fg-2" />}
			<span className="min-w-0 flex-1 truncate">
				<CommandHighlight text={command.label} query={query} />
			</span>
			{command.current ? <span className="text-fg-3 text-sm">Current</span> : null}
			{command.keys?.length ? (
				<CommandShortcut>
					{command.keys.map((key) => (
						<Kbd key={key}>{key}</Kbd>
					))}
				</CommandShortcut>
			) : null}
		</CommandItem>
	);
}

function CardRow({ card, board, query, onPick }: { card: Card; board: Board; query: string; onPick: () => void }) {
	const column = board.columns.find((c) => c.cards.some((x) => x.item_id === card.item_id));
	const title = card.kind === "redacted" ? "Redacted item" : card.title;
	const where = "number" in card ? `${card.repo.slice(card.repo.indexOf("/") + 1)} #${card.number}` : "draft";
	return (
		<CommandItem value={`${title} ${where} ${card.item_id}`} onSelect={onPick}>
			<span className="grid w-[18px] place-items-center">
				{card.kind === "pull_request" ? (
					<GitMerge className="size-4 text-fg-3" />
				) : (
					<span className="size-[11px] rounded-xs shadow-[inset_0_0_0_1.5px_var(--pl-fg-3)]" />
				)}
			</span>
			<span className="min-w-0 flex-1 truncate">
				<CommandHighlight text={title} query={query} />
			</span>
			<span className="font-mono text-fg-3 text-xs">{where}</span>
			{column ? (
				<span className="inline-flex h-4 items-center gap-1 rounded-xs bg-hover px-[5px] text-2xs text-fg-2">
					<StatusSquare status={statusTone(column.color, column.name)} className="size-1.5" />
					{column.name}
				</span>
			) : null}
		</CommandItem>
	);
}
