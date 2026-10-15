import { ChevronsUpDown, Plus, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { type StatusKey, StatusSquare } from "@/components/ui/status";
import { cn } from "@/lib/cn";

const rowClass =
	"flex w-full items-center rounded-md border-0 text-left outline-none transition-colors focus-visible:shadow-ring";

/** The vibrancy column on the left: 232 px, room for the traffic lights at the top. */
export function Sidebar({ className, ...props }: ComponentProps<"aside">) {
	return (
		<aside
			data-slot="sidebar"
			className={cn(
				"flex h-full w-sidebar shrink-0 flex-col gap-3.5 border-line border-r bg-sidebar px-2 pt-11 pb-2 backdrop-blur-[40px] backdrop-saturate-[1.8]",
				className,
			)}
			{...props}
		/>
	);
}

type SidebarAccountProps = ComponentProps<"button"> & { login: string; avatarUrl?: string };

export function SidebarAccount({ login, avatarUrl, className, ...props }: SidebarAccountProps) {
	return (
		<button
			type="button"
			data-slot="sidebar-account"
			className={cn(rowClass, "h-7 gap-2 px-1.5 hover:bg-hover", className)}
			{...props}
		>
			<Avatar src={avatarUrl} alt={login} size={18} />
			<span className="flex-1 truncate font-semibold">{login}</span>
			<ChevronsUpDown className="size-4 text-fg-3" aria-hidden />
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
			<div className="flex h-[22px] items-center pr-1 pl-2 font-semibold text-[11px] text-fg-3">
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
			className={cn(rowClass, "h-row gap-2 px-2 hover:bg-hover", active && "bg-active font-semibold", className)}
			{...props}
		>
			<StatusSquare status={tone} className="size-3 rounded-xs" />
			<span className="flex-1 truncate">{name}</span>
			{count != null ? <span className="font-mono text-2xs text-fg-3">{count}</span> : null}
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
