import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useState } from "react";
import { Board } from "@/board/Board";
import { EmptyBoard, LoadingBoard, SyncBar } from "@/board/BoardStates";
import { cardData } from "@/board/Card";
import { statusTone } from "@/board/statusTone";
import { useMoveCard } from "@/board/useMoveCard";
import { IssueListGroup } from "@/components/ui/issue-list";
import { notify } from "@/components/ui/toast";
import type { ProjectId } from "@/ipc/bindings";
import { errorMessage, useBoard, useOpenProject, useProject, useRefresh, useSyncStatus } from "@/ipc/queries";
import { shortcuts, useShortcut } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { OfflineBanner } from "./OfflineBanner";
import { Palette } from "./Palette";
import { AppSidebar } from "./Sidebar";
import { type ProjectLayout, Toolbar } from "./Toolbar";

/** The main window: sidebar, toolbar, and the board of the open project. */
export function Shell({ projectId }: { projectId: ProjectId }) {
	const [layout, setLayout] = useState<ProjectLayout>("board");
	const [paletteOpen, setPaletteOpen] = useState(false);
	const showPalette = useCallback(() => setPaletteOpen(true), []);
	useShortcut(shortcuts.palette, showPalette);
	const { viewId, selectProject, selectView } = useUi();
	const board = useBoard(projectId, viewId);
	const project = useProject(projectId);
	const status = useSyncStatus();
	const open = useOpenProject();
	const refresh = useRefresh();
	const move = useMoveCard(projectId, viewId);

	const syncNow = useCallback(() => {
		refresh.mutate(projectId, { onError: (error) => notify(`Sync failed: ${errorMessage(error)}`, "error") });
	}, [refresh, projectId]);
	useShortcut(shortcuts.syncNow, syncNow);

	const openIssue = (id: string) => {
		const card = board.data?.columns.flatMap((c) => c.cards).find((c) => c.item_id === id);
		if (card && "url" in card) openUrl(card.url);
	};
	const cards = board.data?.columns.reduce((sum, c) => sum + c.cards.length, 0);
	const syncing = status.data?.state.type === "syncing";
	const offline = status.data?.state.type === "offline";
	return (
		<div className="flex h-screen overflow-hidden bg-bg-sunken">
			<AppSidebar
				projectId={projectId}
				cardCount={cards}
				syncedAt={board.data?.synced_at ?? null}
				onSelect={(id) => {
					selectProject(id);
					open.mutate(id);
				}}
				onSearch={showPalette}
			/>
			<main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-bg shadow-panel">
				<Toolbar
					board={board.data}
					project={project.data}
					status={status.data}
					onSelectView={selectView}
					layout={layout}
					onLayoutChange={setLayout}
					onSearch={showPalette}
				/>
				{syncing ? <SyncBar /> : null}
				{offline ? <OfflineBanner retryAt={status.data?.retry_at ?? null} onRetry={syncNow} /> : null}
				<div className="min-h-0 flex-1">
					{board.data == null ? (
						<LoadingBoard />
					) : cards === 0 ? (
						<EmptyBoard board={board.data} />
					) : layout === "list" ? (
						<div data-slot="issue-list" className="h-full overflow-y-auto">
							{board.data.columns.map((column) => (
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
								/>
							))}
						</div>
					) : (
						<Board board={board.data} onMove={move} />
					)}
				</div>
			</main>
			<Palette
				open={paletteOpen}
				onOpenChange={setPaletteOpen}
				board={board.data}
				onSync={syncNow}
				onLayoutChange={setLayout}
				onOpenIssue={openIssue}
			/>
		</div>
	);
}
