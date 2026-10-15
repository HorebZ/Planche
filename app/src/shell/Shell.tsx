import { useCallback } from "react";
import { Board } from "@/board/Board";
import { EmptyBoard, LoadingBoard, SyncBar } from "@/board/BoardStates";
import { useMoveCard } from "@/board/useMoveCard";
import { notify } from "@/components/ui/toast";
import type { ProjectId } from "@/ipc/bindings";
import { errorMessage, useBoard, useOpenProject, useProject, useRefresh, useSyncStatus } from "@/ipc/queries";
import { shortcuts, useShortcut } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { OfflineBanner } from "./OfflineBanner";
import { AppSidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

/** The main window: sidebar, toolbar, and the board of the open project. */
export function Shell({ projectId }: { projectId: ProjectId }) {
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

	const cards = board.data?.columns.reduce((sum, c) => sum + c.cards.length, 0);
	const syncing = status.data?.state.type === "syncing";
	const offline = status.data?.state.type === "offline";
	return (
		<div className="flex h-screen overflow-hidden">
			<AppSidebar
				projectId={projectId}
				cardCount={cards}
				syncedAt={board.data?.synced_at ?? null}
				onSelect={(id) => {
					selectProject(id);
					open.mutate(id);
				}}
				onSyncNow={syncNow}
			/>
			<main className="relative flex min-w-0 flex-1 flex-col bg-bg">
				<Toolbar board={board.data} project={project.data} status={status.data} onSelectView={selectView} />
				{syncing ? <SyncBar /> : null}
				{offline ? <OfflineBanner retryAt={status.data?.retry_at ?? null} onRetry={syncNow} /> : null}
				<div className="min-h-0 flex-1">
					{board.data == null ? (
						<LoadingBoard />
					) : cards === 0 ? (
						<EmptyBoard board={board.data} />
					) : (
						<Board board={board.data} onMove={move} />
					)}
				</div>
			</main>
		</div>
	);
}
