import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useState } from "react";
import { AssigneePicker } from "@/board/AssigneePicker";
import { Board } from "@/board/Board";
import { EmptyBoard, LoadingBoard, SyncBar } from "@/board/BoardStates";
import { cardData } from "@/board/Card";
import { StatusMenu } from "@/board/StatusMenu";
import { statusTone } from "@/board/statusTone";
import { useActions } from "@/board/useActions";
import { CommandPalette } from "@/command/CommandPalette";
import { archive, columnIndexOf, createDraft, moveTo, paletteCommands, toggleAssignee } from "@/command/commands";
import { ShortcutSheet } from "@/command/ShortcutSheet";
import { Banner } from "@/components/ui/banner";
import { IssueListGroup } from "@/components/ui/issue-list";
import { notify } from "@/components/ui/toast";
import type { Card, Column, OptionId, ProjectId, User } from "@/ipc/bindings";
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
import { type ProjectLayout, Toolbar } from "./Toolbar";

/** The card's page on github.com. A draft has none, so its project's. */
function urlOf(card: Card, projectUrl: string) {
	return "url" in card ? card.url : projectUrl;
}

/** The main window: sidebar, toolbar, and the board of the open project. */
export function Shell({ projectId }: { projectId: ProjectId }) {
	const [layout, setLayout] = useState<ProjectLayout>("board");
	const showPalette = () => show({ type: "palette" });
	const queryClient = useQueryClient();
	const viewId = useUi((s) => s.viewId);
	const selectedId = useUi((s) => s.selectedId);
	const overlay = useUi((s) => s.overlay);
	const drafting = overlay?.type === "draft";
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
	const newDraft = (column: OptionId | null) => {
		setLayout("board");
		show({ type: "draft", column });
	};
	const newIssue = () => {
		if (!data) return;
		const column = card ? data.columns[columnIndexOf(data, card)] : data.columns[0];
		newDraft(column?.option_id ?? null);
	};
	const step = (direction: Direction) => {
		if (!data) return;
		if (layout === "board") return select(navigate(data, selectedId, direction));
		const rows = [...document.querySelectorAll<HTMLElement>('[data-slot="issue-list-row"]')];
		const at = rows.findIndex((row) => row.dataset.itemId === selectedId);
		if (direction === "left" || direction === "right") {
			const group = rows[at]?.closest('[data-slot="issue-list-group"]');
			const header = group?.querySelector<HTMLButtonElement>("button[aria-expanded]");
			if (header && (header.getAttribute("aria-expanded") === "true") === (direction === "left")) {
				header.click();
				header.focus();
				select(null);
			}
			return;
		}
		const next = at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + (direction === "next" ? 1 : -1)));
		rows[next]?.focus();
	};
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
		"palette.open": showPalette,
		"settings.open": () => show({ type: "settings" }),
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
		showBoard: () => setLayout("board"),
		showList: () => setLayout("list"),
	});

	const { run } = actions;
	const onCreateDraft = useCallback(
		(column: Column, title: string) => data && void run(createDraft(data, column.option_id, title)),
		[data, run],
	);
	const openIssue = (id: string) => {
		const target = data?.columns.flatMap((c) => c.cards).find((c) => c.item_id === id);
		if (target && data) void openUrl(urlOf(target, data.project.url));
	};
	const cards = data?.columns.reduce((sum, c) => sum + c.cards.length, 0);
	const syncing = status.data?.state.type === "syncing";
	const offline = status.data?.state.type === "offline";
	return (
		<div className="flex h-screen overflow-hidden bg-bg-sunken">
			<AppSidebar
				projectId={projectId}
				cardCount={cards}
				syncedAt={data?.synced_at ?? null}
				onSelect={goTo}
				onSearch={showPalette}
				onNewIssue={newIssue}
			/>
			<main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-bg shadow-panel">
				<Toolbar
					board={data}
					project={project.data}
					status={status.data}
					onSelectView={selectView}
					layout={layout}
					onLayoutChange={setLayout}
					onSearch={showPalette}
				/>
				{syncing ? <SyncBar /> : null}
				{offline ? <OfflineBanner retryAt={status.data?.retry_at ?? null} onRetry={syncNow} /> : null}
				{data && board.error ? (
					<Banner
						className="mx-3.5 mt-2.5"
						title="Could not refresh this project"
						description={errorMessage(board.error)}
					/>
				) : null}
				<div className="min-h-0 flex-1">
					{data == null ? (
						<LoadingBoard />
					) : cards === 0 && !drafting ? (
						<EmptyBoard board={data} onNewIssue={newIssue} onNewDraft={newDraft} />
					) : layout === "list" ? (
						<div data-slot="issue-list" className="h-full overflow-y-auto">
							{data.columns.map((column) => (
								<IssueListGroup
									key={column.option_id ?? "none"}
									name={column.name}
									status={statusTone(column.color, column.name)}
									items={column.cards.map((card) => ({
										...cardData(card),
										status: card.kind === "draft" ? "draft" : statusTone(column.color, column.name),
										id: card.item_id,
										pending: card.pending,
									}))}
									onOpen={openIssue}
									onSelect={select}
									selectedId={selectedId}
									focusSelection={overlay === null}
								/>
							))}
						</div>
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
