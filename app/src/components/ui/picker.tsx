import { Command as CommandPrimitive } from "cmdk";
import { Check, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Avatar, type AvatarUser } from "@/components/ui/avatar";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { type StatusKey, StatusSquare } from "@/components/ui/status";
import { cn } from "@/lib/cn";

type PickerProps = Omit<ComponentProps<typeof Command>, "children"> & { placeholder: string; children: ReactNode };

/** A filterable menu: a "Move to…" field over 30 px rows, 252 px wide, as the v2 Status menu draws it. */
function Picker({ placeholder, className, children, ...props }: PickerProps) {
	return (
		<Command loop className={cn("w-[252px] rounded-xl p-1 text-[12.5px]", className)} {...props}>
			<div className="mb-[3px] flex h-[30px] items-center gap-1.5 border-line border-b px-1.5 pb-1 text-fg-3">
				<Search className="size-[15px] shrink-0" aria-hidden />
				<CommandPrimitive.Input
					placeholder={placeholder}
					className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3 focus-visible:shadow-none"
				/>
			</div>
			<CommandList className="max-h-[260px] p-0">{children}</CommandList>
		</Command>
	);
}

const rowClass = "h-[30px] gap-2 rounded-sm pr-1.5 pl-2 text-[12.5px]";

export type StatusOption = { id: string; name: string; status: StatusKey; current: boolean; keys?: string };

type StatusListProps = Omit<PickerProps, "placeholder" | "children" | "onSelect"> & {
	options: StatusOption[];
	onPick: (id: string) => void;
};

/** The Status menu: one row per option, a check on the current one, and its digit. */
export function StatusList({ options, onPick, ...props }: StatusListProps) {
	return (
		<Picker placeholder="Change status…" {...props}>
			<CommandEmpty className="py-2 text-xs">No status</CommandEmpty>
			{options.map((option) => (
				<CommandItem key={option.id} value={option.name} onSelect={() => onPick(option.id)} className={rowClass}>
					<StatusSquare status={option.status} />
					<span className="min-w-0 flex-1 truncate">{option.name}</span>
					{option.current ? <Check className="size-[15px] text-fg-2" aria-label="Current" /> : null}
					{option.keys ? (
						<Kbd size="sm" className="text-fg-3">
							{option.keys}
						</Kbd>
					) : null}
				</CommandItem>
			))}
		</Picker>
	);
}

export type UserOption = AvatarUser & { id: string; assigned: boolean };

type UserListProps = Omit<PickerProps, "placeholder" | "children" | "onSelect"> & {
	users: UserOption[] | undefined;
	/** Shown while `users` is undefined, or when the list failed. */
	status?: string;
	onPick: (id: string) => void;
};

/** The assignee picker: avatar, login, and a check on each assigned user. */
export function UserList({ users, status, onPick, ...props }: UserListProps) {
	return (
		<Picker placeholder="Assign…" {...props}>
			{users ? (
				<CommandEmpty className="py-2 text-xs">No one matches</CommandEmpty>
			) : (
				<div className="px-2 py-1.5 text-fg-3 text-xs">{status ?? "Loading…"}</div>
			)}
			{users?.map((user) => (
				<CommandItem key={user.id} value={user.login} onSelect={() => onPick(user.id)} className={rowClass}>
					<Avatar src={user.avatarUrl} alt={user.login} />
					<span className="min-w-0 flex-1 truncate">{user.login}</span>
					{user.assigned ? <Check className="size-[15px] text-fg-2" aria-label="Assigned" /> : null}
				</CommandItem>
			))}
		</Picker>
	);
}
