import { ChevronDown, Plus, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { AppIcon } from "@/components/ui/onboarding";
import { Spinner } from "@/components/ui/spinner";
import type { StatusKey } from "@/components/ui/status";
import { cn } from "@/lib/cn";

const projectTones: Record<StatusKey, string> = {
	backlog: "bg-fg-3",
	draft: "bg-fg-3",
	todo: "bg-status-todo",
	doing: "bg-status-doing",
	progress: "bg-status-doing",
	review: "bg-status-review",
	done: "bg-status-done",
	cancelled: "bg-fg-3",
	deleted: "bg-fg-3",
};

const rowClass =
	"flex w-full items-center rounded-md border-0 text-left outline-none transition-colors focus-visible:shadow-ring";

/** The sidebar sits on the window chrome, below the native traffic lights. */
export function Sidebar({ className, ...props }: ComponentProps<"aside">) {
	return (
		<aside
			data-slot="sidebar"
			className={cn("flex h-full w-sidebar shrink-0 flex-col gap-[18px] px-2.5 pt-[42px] pb-2.5", className)}
			{...props}
		/>
	);
}

type SidebarAccountProps = ComponentProps<"button"> & { login: string; avatarUrl?: string };

export function SidebarAccount({ login, avatarUrl: _avatarUrl, className, ...props }: SidebarAccountProps) {
	return (
		<button
			type="button"
			data-slot="sidebar-account"
			aria-label={`Planche account: ${login}`}
			className={cn(rowClass, "h-7 min-w-0 flex-1 gap-2 px-1 hover:bg-hover", className)}
			{...props}
		>
			<AppIcon size={18} className="rounded-sm shadow-card" />
			<span className="truncate font-semibold">Planche</span>
			<ChevronDown className="size-4 text-fg-3" aria-hidden />
		</button>
	);
}

export function SidebarSearch({ className, ...props }: ComponentProps<"button">) {
	return (
		<button
			type="button"
			data-slot="sidebar-search"
			className={cn(
				rowClass,
				"h-row gap-1.5 bg-hover pr-1 pl-[7px] text-fg-3 shadow-[inset_0_0_0_1px_var(--pl-border)]",
				className,
			)}
			{...props}
		>
			<Search className="size-4" aria-hidden />
			<span className="flex-1">Search or run…</span>
			<Kbd>⌘K</Kbd>
		</button>
	);
}

type SidebarGroupProps = ComponentProps<"div"> & { title: string; action?: ReactNode };

export function SidebarGroup({ title, action, className, children, ...props }: SidebarGroupProps) {
	return (
		<div data-slot="sidebar-group" className={cn("flex flex-col gap-px", className)} {...props}>
			<div className="flex h-[22px] items-center pr-1 pl-2 font-medium text-[11.5px] text-fg-3">
				<span className="flex-1">{title}</span>
				{action}
			</div>
			{children}
		</div>
	);
}

export function SidebarGroupAction({ className, ...props }: ComponentProps<"button">) {
	return (
		<button
			type="button"
			className={cn(
				"grid size-5 place-items-center rounded-sm outline-none hover:bg-hover focus-visible:shadow-ring",
				className,
			)}
			{...props}
		>
			<Plus className="size-4" aria-hidden />
		</button>
	);
}

type SidebarItemProps = ComponentProps<"button"> & {
	name: string;
	/** The colored square before the name. */
	tone: StatusKey;
	count?: number;
	active?: boolean;
};

export function SidebarItem({ name, tone, count, active = false, className, ...props }: SidebarItemProps) {
	return (
		<button
			type="button"
			data-slot="sidebar-item"
			data-active={active || undefined}
			aria-current={active ? "page" : undefined}
			className={cn(
				rowClass,
				"h-row gap-2.5 px-2.5 font-medium text-fg-2 hover:bg-hover",
				active && "bg-active text-fg",
				className,
			)}
			{...props}
		>
			<span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", active ? "bg-accent" : projectTones[tone])} />
			<span className="flex-1 truncate">{name}</span>
			{count != null ? <span className="text-[11.5px] text-fg-3 tabular-nums">{count}</span> : null}
		</button>
	);
}

export type SyncTone = "ok" | "syncing" | "offline";

type SidebarFooterProps = ComponentProps<"div"> & { tone: SyncTone; text: string };

/** The sync state at the bottom of the sidebar. `children` is the trailing button. */
export function SidebarFooter({ tone, text, className, children, ...props }: SidebarFooterProps) {
	return (
		<div
			data-slot="sidebar-footer"
			data-tone={tone}
			className={cn("flex h-7 items-center gap-1.5 pr-0.5 pl-2", className)}
			{...props}
		>
			{tone === "syncing" ? (
				<Spinner size={11} />
			) : (
				<span
					aria-hidden
					className={cn("size-1.5 shrink-0 rounded-full", tone === "ok" ? "bg-success" : "bg-danger")}
				/>
			)}
			<span className={cn("flex-1 truncate text-[11.5px]", tone === "offline" ? "text-danger" : "text-fg-3")}>
				{text}
			</span>
			{children}
		</div>
	);
}
