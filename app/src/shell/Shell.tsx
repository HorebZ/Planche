import { useCallback } from "react";
import { Board } from "@/board/Board";
import { EmptyBoard, LoadingBoard, SyncBar } from "@/board/BoardStates";
import { toast } from "@/components/ui/toast";
import type { ProjectId } from "@/ipc/bindings";
import { errorMessage, useBoard, useOpenProject, useProject, useRefresh, useSyncStatus } from "@/ipc/queries";
import { shortcuts, useShortcut } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
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

	const syncNow = useCallback(() => {
		refresh.mutate(projectId, { onError: (error) => toast.error(`Sync failed: ${errorMessage(error)}`) });
	}, [refresh, projectId]);
	useShortcut(shortcuts.syncNow, syncNow);

	const cards = board.data?.columns.reduce((sum, c) => sum + c.cards.length, 0);
	const syncing = status.data?.state.type === "syncing";
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
				<div className="min-h-0 flex-1">
					{board.data == null ? (
						<LoadingBoard />
					) : cards === 0 ? (
						<EmptyBoard board={board.data} />
					) : (
						<Board board={board.data} />
					)}
				</div>
			</main>
		</div>
	);
}
