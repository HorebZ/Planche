import { Settings } from "lucide-react";
import { useState } from "react";
import { AppLockContent } from "@/components/ui/app-lock";
import { EmptyBoardCard, SkeletonColumn } from "@/components/ui/board-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountBlock, AppIcon, Logotype, ScopeRow } from "@/components/ui/onboarding";
import { SettingsDialog } from "@/components/ui/settings";
import {
	Sidebar,
	SidebarAccount,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarItem,
	SidebarSearch,
} from "@/components/ui/sidebar";
import { SidebarProject } from "@/components/ui/sidebar-project";
import { Spinner } from "@/components/ui/spinner";
import { SyncIndicator } from "@/components/ui/sync-indicator";
import { Row, Section, State } from "../kit";

const settings = (
	<Button variant="ghost" size="icon" aria-label="Sync settings" className="size-6 text-fg-3">
		<Settings className="size-[17px]" />
	</Button>
);

export function ShellSection() {
	return (
		<Section id="shell" title="Sidebar · Sync · Board states · Onboarding">
			{() => (
				<div className="flex flex-col gap-5">
					<Row label="app lock">
						{["locked", "unlocking", "cancelled"].map((state) => (
							<State key={state} label={state} className="w-full rounded-xl bg-elevated p-5 shadow-panel">
								<AppLockContent
									pending={state === "unlocking"}
									error={state === "cancelled" ? "Authentication cancelled. Try again when you're ready." : undefined}
									onUnlock={() => {}}
								/>
							</State>
						))}
					</Row>
					<Row label="sidebar">
						<Sidebar className="h-[360px] rounded-lg">
							<div className="flex flex-col gap-1.5">
								<SidebarAccount login="camille-r" />
								<SidebarSearch />
							</div>
							<SidebarGroup title="Projects" action={<SidebarGroupAction aria-label="Add project" />}>
								<SidebarItem name="Planche — v1.2" tone="done" count={26} active />
								<SidebarItem name="Website" tone="todo" count={8} />
								<SidebarItem name="A very long project name that overflows" tone="review" data-preview="hover" />
								<SidebarItem name="Focused" tone="doing" data-preview="focus" />
							</SidebarGroup>
							<span className="flex-1" />
							<SidebarFooter tone="ok" text="Synced 2 min ago">
								{settings}
							</SidebarFooter>
						</Sidebar>
						<div className="flex w-sidebar flex-col gap-2">
							<State label="footer syncing" className="w-full">
								<SidebarFooter tone="syncing" text="Syncing…" className="w-full">
									{settings}
								</SidebarFooter>
							</State>
							<State label="footer offline" className="w-full">
								<SidebarFooter tone="offline" text="Offline · 1 change pending" className="w-full">
									{settings}
								</SidebarFooter>
							</State>
						</div>
					</Row>
					<Row label="sidebar project menus">
						<div className="w-sidebar">
							<SidebarProject
								name="Design system"
								tone="review"
								active={false}
								hidden={false}
								onOpen={() => {}}
								onOpenGitHub={() => {}}
								onHide={() => {}}
							/>
							<SidebarProject
								name="Hidden project"
								tone="todo"
								active={false}
								hidden
								onOpen={() => {}}
								onOpenGitHub={() => {}}
								onHide={() => {}}
							/>
						</div>
					</Row>
					<Row label="settings">
						<SettingsPreview />
					</Row>
					<Row label="toolbar sync indicator">
						<State label="idle">
							<SyncIndicator state="idle" />
						</State>
						<State label="syncing">
							<SyncIndicator state="busy" label="Syncing 3 of 5…" />
						</State>
						<State label="loading">
							<SyncIndicator state="busy" label="Loading 142 items…" />
						</State>
						<State label="offline">
							<SyncIndicator state="offline" />
						</State>
					</Row>
					<Row label="board states">
						<State label="5a skeleton column">
							<SkeletonColumn cards={3} />
						</State>
						<State label="5d empty board">
							<EmptyBoardCard />
						</State>
					</Row>
					<Row label="onboarding">
						<State label="icon and logotype">
							<div className="flex flex-col gap-3">
								<AppIcon />
								<Logotype />
							</div>
						</State>
						<div className="flex w-[380px] flex-col gap-3">
							<State label="token checking" className="w-full">
								<Input
									mono
									className="h-[34px] w-full"
									data-preview="focus"
									defaultValue="ghp_7Hq2••••••••••8f2c"
									suffix={
										<span className="flex items-center gap-1.5 text-fg-3 text-xs">
											<Spinner size={11} />
											Checking…
										</span>
									}
								/>
							</State>
							<State label="token invalid" className="w-full">
								<Input mono invalid className="h-[34px] w-full" defaultValue="ghp_wrong" />
							</State>
							<State label="account" className="w-full">
								<AccountBlock login="camille-r" projects={5} className="w-full" />
							</State>
							<State label="scopes" className="w-full">
								<div className="flex flex-col gap-0.5">
									<ScopeRow name="repo" why="Read issues and pull requests" state="ok" />
									<ScopeRow name="read:org" why="List your organizations" state="checking" />
									<ScopeRow name="project" why="Read and move project cards" state="missing" />
									<ScopeRow name="project" why="Not checked yet" state="idle" />
								</div>
							</State>
						</div>
					</Row>
				</div>
			)}
		</Section>
	);
}

function SettingsPreview() {
	const [open, setOpen] = useState(false);
	const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
	const [interval, setInterval] = useState("five_minutes");
	const [wake, setWake] = useState(true);
	return (
		<>
			<Button onClick={() => setOpen(true)}>Open settings</Button>
			<SettingsDialog
				open={open}
				onOpenChange={setOpen}
				login="camille-r"
				interval={interval}
				onIntervalChange={setInterval}
				onWake={wake}
				onWakeChange={setWake}
				theme={theme}
				onThemeChange={setTheme}
				onSignOut={() => {}}
				shortcuts={[{ label: "Command palette", keys: "⌘K" }]}
			/>
		</>
	);
}
