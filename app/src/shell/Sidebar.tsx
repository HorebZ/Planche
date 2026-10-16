import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarAccount,
	SidebarFooter,
	SidebarGroup,
	SidebarItem,
	SidebarSearch,
} from "@/components/ui/sidebar";
import type { StatusKey } from "@/components/ui/status";
import { commands, type ProjectId, type SyncInterval } from "@/ipc/bindings";
import { useAuth, useProjects, useSetSyncPrefs, useSyncPrefs, useSyncStatus } from "@/ipc/queries";
import { keysFor } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { footerText } from "./syncText";

const intervals: { value: SyncInterval; label: string }[] = [
	{ value: "one_minute", label: "1 min" },
	{ value: "five_minutes", label: "5 min" },
	{ value: "fifteen_minutes", label: "15 min" },
	{ value: "manual", label: "Manual" },
];

/** GitHub projects have no color, so each takes a status tone from its number. */
const tones: StatusKey[] = ["done", "todo", "review", "doing", "backlog"];

type AppSidebarProps = {
	projectId: ProjectId | null;
	cardCount?: number;
	syncedAt: string | null;
	onSelect: (projectId: ProjectId) => void;
	onSyncNow: () => void;
};

export async function signOut(queryClient: QueryClient) {
	await commands.authSignOut();
	await queryClient.invalidateQueries({ queryKey: ["auth"] });
}

export function AppSidebar({ projectId, cardCount, syncedAt, onSelect, onSyncNow }: AppSidebarProps) {
	const queryClient = useQueryClient();
	const auth = useAuth();
	const projects = useProjects();
	const login = auth.data?.login ?? "";
	return (
		<Sidebar>
			<div className="flex flex-col gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarAccount login={login} avatarUrl={auth.data?.avatar_url ?? undefined} />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[216px]">
						<DropdownMenuLabel>Signed in as {login}</DropdownMenuLabel>
						<DropdownMenuItem variant="destructive" onSelect={() => signOut(queryClient)}>
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<SidebarSearch onClick={() => useUi.getState().open({ type: "palette" })} />
			</div>
			<div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto">
				{projects.data?.owners.map((owner, index) => {
					const open = owner.projects.filter((p) => !p.closed);
					if (open.length === 0) return null;
					return (
						<SidebarGroup key={owner.login} title={index === 0 ? "Projects" : owner.login}>
							{open.map((project) => (
								<SidebarItem
									key={project.id}
									name={project.title}
									tone={tones[project.number % tones.length]}
									count={project.id === projectId ? cardCount : undefined}
									active={project.id === projectId}
									onClick={() => onSelect(project.id)}
								/>
							))}
						</SidebarGroup>
					);
				})}
			</div>
			<span className="flex-1" />
			<SyncFooter syncedAt={syncedAt} onSyncNow={onSyncNow} />
		</Sidebar>
	);
}

function SyncFooter({ syncedAt, onSyncNow }: { syncedAt: string | null; onSyncNow: () => void }) {
	const status = useSyncStatus();
	const prefs = useSyncPrefs();
	const setPrefs = useSetSyncPrefs();
	const now = useNow(30_000);
	const { tone, text } = footerText(status.data, syncedAt, now);
	return (
		<SidebarFooter tone={tone} text={text}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" aria-label="Sync settings" className="size-6 text-fg-3 hover:text-fg">
						<Settings className="size-[17px]" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" className="w-[216px]">
					<DropdownMenuLabel>Sync every</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={prefs.data?.interval}
						onValueChange={(value) => prefs.data && setPrefs.mutate({ ...prefs.data, interval: value as SyncInterval })}
					>
						{intervals.map((interval) => (
							<DropdownMenuRadioItem key={interval.value} value={interval.value}>
								{interval.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={onSyncNow}>
						Sync now
						<DropdownMenuShortcut>{keysFor("sync.now").join("")}</DropdownMenuShortcut>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarFooter>
	);
}

/** The current time, refreshed every `ms`, for relative times. */
function useNow(ms: number) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), ms);
		return () => clearInterval(timer);
	}, [ms]);
	return now;
}
