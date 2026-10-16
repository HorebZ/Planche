import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback } from "react";
import { AssigneePicker } from "@/board/AssigneePicker";
import { Board } from "@/board/Board";
import { EmptyBoard, LoadingBoard, SyncBar } from "@/board/BoardStates";
import { StatusMenu } from "@/board/StatusMenu";
import { useActions } from "@/board/useActions";
import { CommandPalette } from "@/command/CommandPalette";
import { archive, columnIndexOf, createDraft, moveTo, paletteCommands, toggleAssignee } from "@/command/commands";
import { ShortcutSheet } from "@/command/ShortcutSheet";
import { notify } from "@/components/ui/toast";
import type { Card, Column, ProjectId, User } from "@/ipc/bindings";
import {
	errorMessage,
	useAuth,
	useBoard,
	useOpenProject,
	useProject,
	useProjects,
	useRefresh,
	useSyncStatus,
} from "@/ipc/queries";
import { type Direction, navigate } from "@/keyboard/shortcuts";
import { useShortcuts } from "@/keyboard/useShortcuts";
import { useUi } from "@/stores/ui";
import { OfflineBanner } from "./OfflineBanner";
import { AppSidebar, signOut } from "./Sidebar";
import { Toolbar } from "./Toolbar";

/** The card's page on github.com. A draft has none, so its project's. */
function urlOf(card: Card, projectUrl: string) {
	return "url" in card ? card.url : projectUrl;
}

/** The main window: sidebar, toolbar, and the board of the open project. */
export function Shell({ projectId }: { projectId: ProjectId }) {
	const queryClient = useQueryClient();
	const viewId = useUi((s) => s.viewId);
	const selectedId = useUi((s) => s.selectedId);
	const { selectProject, selectView, select, open: show } = useUi.getState();
	const board = useBoard(projectId, viewId);
	const project = useProject(projectId);
	const projects = useProjects();
	const status = useSyncStatus();
	const auth = useAuth();
	const openProject = useOpenProject();
	const refresh = useRefresh();
	const actions = useActions(projectId, viewId);

	const data = board.data ?? null;
	const card = data?.columns.flatMap((c) => c.cards).find((c) => c.item_id === selectedId) ?? null;
	const viewer: User | null = auth.data?.id
		? { id: auth.data.id, login: auth.data.login ?? "", avatar_url: auth.data.avatar_url ?? "" }
		: null;

	const syncNow = useCallback(() => {
		refresh.mutate(projectId, { onError: (error) => notify(`Sync failed: ${errorMessage(error)}`, "error") });
	}, [refresh, projectId]);
	const goTo = (id: ProjectId) => {
		selectProject(id);
		openProject.mutate(id);
	};
	const newIssue = () => {
		if (!data) return;
		const column = card ? data.columns[columnIndexOf(data, card)] : data.columns[0];
		show({ type: "draft", column: column?.option_id ?? null });
	};
	const step = (direction: Direction) => data && select(navigate(data, selectedId, direction));
	const moveBy = (offset: number) => {
		if (!data || !card) return;
		const target = data.columns[columnIndexOf(data, card) + offset];
		if (target) void actions.run(moveTo(data, card, target.option_id));
	};
	const toggle = (user: User | null) => {
		if (!data || !card) return;
		if (!user) return notify("Planche does not know your GitHub user yet. Sync, then try again.", "error");
		const intent = toggleAssignee(data, card, user);
		if (intent) void actions.run(intent);
	};

	useShortcuts({
		"palette.open": () => show({ type: "palette" }),
		"issue.new": newIssue,
		"sync.now": syncNow,
		"help.open": () => show({ type: "help" }),
		"card.next": () => step("next"),
		"card.prev": () => step("prev"),
		"column.next": () => step("right"),
		"column.prev": () => step("left"),
		// The detail panel arrives with #11. Until then, Enter opens the card on github.com.
		"card.open": () => card && data && void openUrl(urlOf(card, data.project.url)),
		"card.github": () => card && data && void openUrl(urlOf(card, data.project.url)),
		"selection.clear": () => {
			select(null);
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		},
		"card.moveNext": () => moveBy(1),
		"card.movePrev": () => moveBy(-1),
		"card.status": () => card && show({ type: "status" }),
		"card.assignMe": () => toggle(viewer),
		"card.copyLink": () => {
			if (!card || !data) return;
			navigator.clipboard.writeText(urlOf(card, data.project.url)).then(
				() => notify("Link copied", "success"),
				(error) => notify(`Couldn't copy the link: ${errorMessage(error)}`, "error"),
			);
		},
		undo: () => void actions.undo(),
	});

	const commands = paletteCommands(data, card, projects.data?.owners ?? [], {
		move: (to) => data && card && void actions.run(moveTo(data, card, to)),
		assign: () => show({ type: "assign" }),
		archive: () => data && card && void actions.run(archive(data, card)),
		newIssue,
		syncNow,
		openProject: goTo,
		signOut: () => void signOut(queryClient),
	});

	const { run } = actions;
	const onCreateDraft = useCallback(
		(column: Column, title: string) => data && void run(createDraft(data, column.option_id, title)),
		[data, run],
	);
	const cards = data?.columns.reduce((sum, c) => sum + c.cards.length, 0);
	const syncing = status.data?.state.type === "syncing";
	const offline = status.data?.state.type === "offline";
	return (
		<div className="flex h-screen overflow-hidden">
			<AppSidebar
				projectId={projectId}
				cardCount={cards}
				syncedAt={data?.synced_at ?? null}
				onSelect={goTo}
				onSyncNow={syncNow}
			/>
			<main className="relative flex min-w-0 flex-1 flex-col bg-bg">
				<Toolbar board={data} project={project.data} status={status.data} onSelectView={selectView} />
				{syncing ? <SyncBar /> : null}
				{offline ? <OfflineBanner retryAt={status.data?.retry_at ?? null} onRetry={syncNow} /> : null}
				<div className="min-h-0 flex-1">
					{data == null ? (
						<LoadingBoard />
					) : cards === 0 ? (
						<EmptyBoard board={data} />
					) : (
						<Board board={data} onMove={run} onCreateDraft={onCreateDraft} />
					)}
				</div>
			</main>
			<CommandPalette board={data} card={card} commands={commands} />
			<ShortcutSheet />
			{data && card ? (
				<>
					<StatusMenu board={data} card={card} onMove={(to) => void actions.run(moveTo(data, card, to))} />
					<AssigneePicker board={data} card={card} viewer={viewer} onToggle={toggle} />
				</>
			) : null}
		</div>
	);
}
