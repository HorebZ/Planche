import {
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronRight,
	CircleMinus,
	ExternalLink,
	FolderInput,
	GitMerge,
	Link,
	Maximize2,
	Plus,
	Search,
	Tag,
	UserPlus,
	X,
} from "lucide-react";
import { type ComponentType, type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
	menuContentClassName,
	menuItemVariants,
	menuSeparatorClassName,
	menuShortcutClassName,
} from "@/components/ui/menu-styles";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToastCard, Toaster, toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { Row, Section, State } from "../kit";

type ItemProps = {
	variant?: "default" | "destructive";
	disabled?: boolean;
	className?: string;
	children?: ReactNode;
	"data-preview"?: string;
};

function ShortcutKeys({ children }: { children: ReactNode }) {
	return (
		<Kbd variant="plain" size="inline">
			{children}
		</Kbd>
	);
}

function ActionItems({
	Item,
	Separator,
	Shortcut,
	Sub,
	SubTrigger,
	subContent,
}: {
	Item: ComponentType<ItemProps>;
	Separator: ComponentType<{ children?: ReactNode }>;
	Shortcut: ComponentType<{ children?: ReactNode }>;
	Sub: ComponentType<{ children?: ReactNode }>;
	SubTrigger: ComponentType<ItemProps>;
	subContent?: ReactNode;
}) {
	return (
		<>
			<Item>
				<Maximize2 />
				<span className="flex-1">Open</span>
				<Shortcut>
					<ShortcutKeys>↵</ShortcutKeys>
				</Shortcut>
			</Item>
			<Sub>
				<SubTrigger data-preview="hover">
					<ArrowRight />
					<span className="flex-1">Move to</span>
				</SubTrigger>
				{subContent}
			</Sub>
			<Item disabled>
				<UserPlus />
				<span className="flex-1">Assign to me</span>
				<Shortcut>
					<ShortcutKeys>I</ShortcutKeys>
				</Shortcut>
			</Item>
			<Item>
				<Tag />
				<span className="flex-1">Labels…</span>
				<Shortcut>
					<ShortcutKeys>L</ShortcutKeys>
				</Shortcut>
			</Item>
			<Separator />
			<Item>
				<Link />
				<span className="flex-1">Copy link</span>
				<Shortcut>
					<ShortcutKeys>⌘⇧C</ShortcutKeys>
				</Shortcut>
			</Item>
			<Item variant="destructive">
				<CircleMinus />
				<span className="flex-1">Remove from project</span>
				<Shortcut>
					<ShortcutKeys>⌫</ShortcutKeys>
				</Shortcut>
			</Item>
		</>
	);
}

function StaticItem({ variant, disabled, className, children, ...props }: ItemProps) {
	return (
		<div className={cn(menuItemVariants({ variant }), className)} data-disabled={disabled ? "" : undefined} {...props}>
			{children}
		</div>
	);
}

function StaticSubTrigger({ children, ...props }: ItemProps) {
	return (
		<StaticItem {...props}>
			{children}
			<ChevronRight className="ml-auto text-fg-3!" />
		</StaticItem>
	);
}

function StaticShortcut({ children }: { children?: ReactNode }) {
	return <span className={menuShortcutClassName}>{children}</span>;
}

function StaticSeparator() {
	return <div className={menuSeparatorClassName} />;
}

function StaticSub({ children }: { children?: ReactNode }) {
	return children;
}

function keepOpen(event: { preventDefault(): void }) {
	event.preventDefault();
}

function ConfirmBody() {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Remove from project?</DialogTitle>
				<DialogDescription>
					<span className="font-mono">#226</span> stays on GitHub. It only leaves this board.
				</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<DialogClose asChild>
					<Button variant="ghost">Cancel</Button>
				</DialogClose>
				<Button variant="danger">Remove</Button>
			</DialogFooter>
		</>
	);
}

function Hit({ children }: { children: ReactNode }) {
	return <span className="rounded-[2px] bg-accent-soft font-semibold">{children}</span>;
}

function PaletteFooter() {
	return (
		<div className="flex h-9 items-center gap-4 border-line border-t bg-bg-sunken px-3.5 text-[11.5px] text-fg-3">
			<span className="flex items-center gap-[5px]">
				<Kbd>↑↓</Kbd>Navigate
			</span>
			<span className="flex items-center gap-[5px]">
				<Kbd>↵</Kbd>Run
			</span>
			<span className="flex items-center gap-[5px]">
				<Kbd>⌫</Kbd>Clear #226
			</span>
			<span className="flex-1" />
			<span className="flex items-center gap-[5px]">
				<Kbd>?</Kbd>All shortcuts
			</span>
		</div>
	);
}

function PaletteBody({ preview = false }: { preview?: boolean }) {
	return (
		<>
			<CommandInput
				placeholder="Search or run…"
				className="pr-12"
				{...(preview ? { value: "move", onValueChange: () => undefined } : {})}
			/>
			<Kbd className="pointer-events-none absolute top-4 right-3.5 z-10">esc</Kbd>
			<CommandList>
				<CommandEmpty>No matches</CommandEmpty>
				<CommandGroup heading="Actions on #226">
					<CommandItem value="move-progress" data-preview={preview ? "hover" : undefined}>
						<ArrowRight className="size-[18px] text-fg-2" />
						<span className="min-w-0 flex-1">
							<Hit>Move</Hit> to In progress
						</span>
						<CommandShortcut>
							<Kbd>⇧</Kbd>
							<Kbd>→</Kbd>
						</CommandShortcut>
					</CommandItem>
					<CommandItem value="move-backlog">
						<ArrowLeft className="size-[18px] text-fg-2" />
						<span className="min-w-0 flex-1">
							<Hit>Move</Hit> to Backlog
						</span>
						<CommandShortcut>
							<Kbd>⇧</Kbd>
							<Kbd>←</Kbd>
						</CommandShortcut>
					</CommandItem>
					<CommandItem value="move-project">
						<FolderInput className="size-[18px] text-fg-2" />
						<span className="min-w-0 flex-1">
							<Hit>Move</Hit> to another project…
						</span>
						<CommandShortcut>
							<Kbd>⇧</Kbd>
							<Kbd>M</Kbd>
						</CommandShortcut>
					</CommandItem>
				</CommandGroup>
				<CommandGroup heading="Issues & pull requests" className="mt-1">
					<CommandItem value="issue-214">
						<span className="grid w-[18px] place-items-center">
							<span className="size-[11px] rounded-xs shadow-[inset_0_0_0_1.5px_var(--pl-fg-3)]" />
						</span>
						<span className="min-w-0 flex-1">
							Shortcut to <Hit>move</Hit> a card to the next column
						</span>
						<span className="font-mono text-fg-3 text-xs">app #214</span>
						<span className="inline-flex h-4 items-center gap-1 rounded-xs bg-kbd px-[5px] text-2xs text-fg-2">
							<span className="size-1.5 rounded-[2px] bg-status-backlog" />
							Backlog
						</span>
					</CommandItem>
					<CommandItem value="issue-198">
						<span className="grid w-[18px] place-items-center">
							<GitMerge className="size-4 text-fg-3" />
						</span>
						<span className="min-w-0 flex-1">
							<Hit>Move</Hit> filters into the toolbar
						</span>
						<span className="font-mono text-fg-3 text-xs">app #198</span>
						<span className="inline-flex h-4 items-center gap-1 rounded-xs bg-kbd px-[5px] text-2xs text-fg-2">
							<span className="size-1.5 rounded-[2px] bg-status-done" />
							Done
						</span>
					</CommandItem>
				</CommandGroup>
			</CommandList>
			<PaletteFooter />
		</>
	);
}

function movedMessage() {
	return (
		<>
			<span className="font-mono text-fg-2 text-sm">#226</span> moved to In progress
		</>
	);
}

function OverlaysDemo() {
	const toasterId = useId();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [paletteOpen, setPaletteOpen] = useState(false);

	return (
		<TooltipProvider>
			<div className="flex flex-col gap-5">
				<Row label="dropdown">
					<div className="relative min-h-[230px]">
						<DropdownMenu open modal={false} onOpenChange={() => undefined}>
							<DropdownMenuTrigger asChild>
								<Button variant="secondary">Actions</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								className="w-[232px]"
								avoidCollisions={false}
								onCloseAutoFocus={keepOpen}
								onInteractOutside={keepOpen}
								onFocusOutside={keepOpen}
								onEscapeKeyDown={keepOpen}
							>
								<ActionItems
									Item={DropdownMenuItem}
									Separator={DropdownMenuSeparator}
									Shortcut={DropdownMenuShortcut}
									Sub={DropdownMenuSub}
									SubTrigger={DropdownMenuSubTrigger}
									subContent={
										<DropdownMenuSubContent>
											<DropdownMenuItem>In progress</DropdownMenuItem>
											<DropdownMenuItem>Done</DropdownMenuItem>
										</DropdownMenuSubContent>
									}
								/>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</Row>

				<Row label="context menu">
					<State label="look">
						<div className={cn(menuContentClassName, "w-[232px]")}>
							<ActionItems
								Item={StaticItem}
								Separator={StaticSeparator}
								Shortcut={StaticShortcut}
								Sub={StaticSub}
								SubTrigger={StaticSubTrigger}
							/>
						</div>
					</State>
					<State label="right-click">
						<ContextMenu>
							<ContextMenuTrigger className="flex h-16 w-[200px] items-center rounded-lg bg-surface px-3 text-sm shadow-card">
								Right-click this card
							</ContextMenuTrigger>
							<ContextMenuContent className="w-[232px]">
								<ActionItems
									Item={ContextMenuItem}
									Separator={ContextMenuSeparator}
									Shortcut={ContextMenuShortcut}
									Sub={ContextMenuSub}
									SubTrigger={ContextMenuSubTrigger}
									subContent={
										<ContextMenuSubContent>
											<ContextMenuItem>In progress</ContextMenuItem>
											<ContextMenuItem>Done</ContextMenuItem>
										</ContextMenuSubContent>
									}
								/>
							</ContextMenuContent>
						</ContextMenu>
					</State>
				</Row>

				<Row label="popover · labels">
					<div className="relative min-h-[190px]">
						<Popover open onOpenChange={() => undefined}>
							<PopoverTrigger asChild>
								<Button variant="secondary">Labels</Button>
							</PopoverTrigger>
							<PopoverContent
								avoidCollisions={false}
								onOpenAutoFocus={keepOpen}
								onCloseAutoFocus={keepOpen}
								onInteractOutside={keepOpen}
								onFocusOutside={keepOpen}
							>
								<div className="flex h-[34px] items-center gap-1.5 border-line border-b px-2.5 text-base">
									<Search className="size-4 text-fg-3" />
									<span>de</span>
									<span className="-ml-[5px] h-[15px] w-[1.5px] bg-focus" />
								</div>
								<div className="flex flex-col gap-px p-1">
									<div className="flex h-[26px] items-center gap-2 rounded-sm bg-active px-2 text-sm">
										<span className="grid size-3.5 place-items-center rounded-xs bg-accent text-accent-fg">
											<Check className="size-3" strokeWidth={3} />
										</span>
										<span className="size-1.5 rounded-full bg-status-review" />
										<span className="flex-1">
											<span className="font-semibold">de</span>sign
										</span>
									</div>
									<div className="flex h-[26px] items-center gap-2 rounded-sm px-2 text-sm">
										<span className="size-3.5 rounded-xs shadow-[inset_0_0_0_1.5px_var(--pl-border-strong)]" />
										<span className="size-1.5 rounded-full bg-fg-3" />
										<span className="flex-1">
											<span className="font-semibold">de</span>pendencies
										</span>
									</div>
									<div className="flex h-[26px] items-center gap-2 rounded-sm px-2 text-fg-2 text-sm">
										<Plus className="size-4" />
										<span className="flex-1">Create label “de”</span>
										<Kbd variant="plain" size="inline">
											⌘↵
										</Kbd>
									</div>
								</div>
							</PopoverContent>
						</Popover>
					</div>
				</Row>

				<Row label="tooltip">
					<div className="flex items-end gap-40 pt-9">
						<State label="with shortcut">
							<Tooltip open>
								<TooltipTrigger asChild>
									<Button variant="ghost" size="icon" aria-label="Open on GitHub">
										<ExternalLink />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" align="start" avoidCollisions={false}>
									Open on github.com
									<Kbd variant="onTooltip" size="sm">
										⌘O
									</Kbd>
								</TooltipContent>
							</Tooltip>
						</State>
						<State label="label">
							<Tooltip open>
								<TooltipTrigger asChild>
									<Button variant="ghost" size="sm">
										Filter
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" avoidCollisions={false} className="pr-2">
									Filter the board
								</TooltipContent>
							</Tooltip>
						</State>
					</div>
				</Row>

				<Row label="dialog">
					<State label="content">
						<Dialog>
							<div className="relative flex w-[360px] flex-col gap-4 rounded-xl bg-elevated p-5 shadow-window">
								<ConfirmBody />
								<DialogClose asChild>
									<Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close">
										<X />
									</Button>
								</DialogClose>
							</div>
						</Dialog>
					</State>
					<State label="live">
						<Button variant="secondary" onClick={() => setDialogOpen(true)}>
							Open dialog
						</Button>
						<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
							<DialogContent>
								<ConfirmBody />
							</DialogContent>
						</Dialog>
					</State>
				</Row>

				<div className="flex flex-col gap-2">
					<div className="font-mono text-2xs text-fg-3">command</div>
					<Command
						className="w-full max-w-[640px]"
						shouldFilter={false}
						value="move-progress"
						onValueChange={() => undefined}
					>
						<PaletteBody preview />
					</Command>
					<State label="empty">
						<Command className="w-[280px]">
							<CommandInput placeholder="Search or run…" value="zzzz" onValueChange={() => undefined} />
							<CommandList>
								<CommandEmpty>No matches</CommandEmpty>
								<CommandItem value="move">Move to In progress</CommandItem>
							</CommandList>
						</Command>
					</State>
					<State label="live">
						<Button variant="secondary" onClick={() => setPaletteOpen(true)}>
							Command palette
							<Kbd size="sm">⌘K</Kbd>
						</Button>
						<CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
							<PaletteBody />
						</CommandDialog>
					</State>
				</div>

				<Row label="toast">
					<ToastCard tone="info" message="Synced 142 items" />
					<ToastCard tone="success" message={movedMessage()} action={{ label: "Undo", kbd: "⌘Z" }} />
					<ToastCard
						tone="error"
						message={
							<>
								Couldn't move <span className="font-mono text-fg-2 text-sm">#231</span>: missing{" "}
								<span className="font-mono text-sm">project</span> scope
							</>
						}
					/>
					<Button
						variant="secondary"
						onClick={() =>
							toast.custom(
								(id) => (
									<ToastCard
										tone="success"
										message={movedMessage()}
										action={{ label: "Undo", kbd: "⌘Z", onClick: () => toast.dismiss(id) }}
									/>
								),
								{ toasterId, id: toasterId },
							)
						}
					>
						Show toast
					</Button>
				</Row>
			</div>
			<Toaster id={toasterId} hotkey={[]} />
		</TooltipProvider>
	);
}

export function OverlaysSection() {
	return (
		<Section id="overlays" title="Menus · Popover · Tooltip · Dialog · Palette · Toast">
			{() => <OverlaysDemo />}
		</Section>
	);
}
