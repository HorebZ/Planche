import { ExternalLink, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { SidebarItem } from "@/components/ui/sidebar";
import type { StatusKey } from "@/components/ui/status";
import { matchesShortcut, shortcuts } from "@/keyboard/shortcuts";

export function SidebarProject({
	name,
	tone,
	active,
	count,
	hidden,
	onOpen,
	onOpenGitHub,
	onHide,
}: {
	name: string;
	tone: StatusKey;
	active: boolean;
	count?: number;
	hidden: boolean;
	onOpen: () => void;
	onOpenGitHub: () => void;
	onHide: () => void;
}) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className={`group relative rounded-md ${hidden ? "opacity-55" : ""}`}>
					<SidebarItem
						name={name}
						tone={tone}
						active={active}
						count={count}
						onClick={onOpen}
						onKeyDown={(event) => {
							if (matchesShortcut(event.nativeEvent, shortcuts.hideSidebar)) {
								event.preventDefault();
								onHide();
							}
						}}
						className="pr-8 [&>span:last-child:not(:nth-child(2))]:group-hover:invisible"
					/>
					{hidden ? (
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Show ${name} in sidebar`}
							onClick={onHide}
							className="absolute top-[3px] right-1 size-[22px] text-fg-3"
						>
							<Eye className="size-3.5" />
						</Button>
					) : (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label={`More options for ${name}`}
									className="absolute top-[3px] right-1 size-[22px] text-fg-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:bg-active data-[state=open]:opacity-100"
								>
									<MoreHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent>
								<DropdownMenuItem onSelect={onOpen}>
									Open<Kbd className="ml-auto">↵</Kbd>
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={onOpenGitHub}>
									<ExternalLink />
									Open on GitHub
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={onHide}>
									<EyeOff />
									Hide from sidebar<Kbd className="ml-auto">{shortcuts.hideSidebar.label}</Kbd>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onOpen}>
					Open<Kbd className="ml-auto">↵</Kbd>
				</ContextMenuItem>
				<ContextMenuItem onSelect={onOpenGitHub}>
					<ExternalLink />
					Open on GitHub
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onHide}>
					{hidden ? <Eye /> : <EyeOff />}
					{hidden ? "Show in sidebar" : "Hide from sidebar"}
					<Kbd className="ml-auto">{shortcuts.hideSidebar.label}</Kbd>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
