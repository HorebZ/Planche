import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { notify, ToastCard, toast } from "@/components/ui/toast";
import { type Board, commands, type Intent, type ProjectId, type ViewId } from "@/ipc/bindings";
import { boardQuery, errorMessage } from "@/ipc/queries";
import { keysFor } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { describe, inverse, verbs } from "@/undo/inverse";
import { applyIntent } from "./moveCard";

/**
 * Applies an intent at once in the cached board, then queues it in Rust. Rust's board, with the
 * intent replayed on the server state, replaces the optimistic one. Resolves to `false` when
 * Rust refused it.
 */
export async function dispatchIntent(client: QueryClient, projectId: ProjectId, viewId: ViewId | null, intent: Intent) {
	const key = boardQuery(projectId, viewId).queryKey;
	// A refetch in flight would overwrite the optimistic board with an older one.
	void client.cancelQueries({ queryKey: key });
	const before = client.getQueryData<Board | null>(key);
	if (before) client.setQueryData(key, markPending(applyIntent(before, intent), intent.item_id));
	try {
		client.setQueryData(key, await commands.dispatchIntent(intent, viewId));
		return true;
	} catch (error) {
		client.setQueryData(key, before);
		notify(`Couldn't ${verbs[intent.type]} the card: ${errorMessage(error)}`, "error");
		return false;
	}
}

/** The touched card says "Pending" where it is now, until Rust's board replaces this one. */
function markPending(board: Board, id: string): Board {
	return {
		...board,
		columns: board.columns.map((c) => ({
			...c,
			cards: c.cards.map((card) => (card.item_id === id ? { ...card, pending: true } : card)),
		})),
	};
}

/**
 * `run` dispatches a user action, keeps its inverse for ⌘Z, and shows a toast with "Undo".
 * `undo` dispatches that inverse, once.
 */
export function useActions(projectId: ProjectId, viewId: ViewId | null) {
	const client = useQueryClient();
	return useMemo(() => {
		const board = () => client.getQueryData<Board | null>(boardQuery(projectId, viewId).queryKey);
		const run = async (intent: Intent) => {
			const before = board();
			const undo = before ? inverse(before, intent) : null;
			const label = before ? describe(before, intent) : "Done";
			if (!(await dispatchIntent(client, projectId, viewId, intent))) return;
			useUi.getState().setUndo(undo && { intent: undo, label });
			toast.custom((t) => (
				<ToastCard
					tone="success"
					message={label}
					action={
						undo
							? {
									label: "Undo",
									kbd: keysFor("undo").join(""),
									onClick: () => {
										toast.dismiss(t);
										void undoLast();
									},
								}
							: undefined
					}
				/>
			));
		};
		const undoLast = async () => {
			const last = useUi.getState().undo;
			if (!last) return;
			useUi.getState().setUndo(null);
			toast.dismiss();
			if (await dispatchIntent(client, projectId, viewId, last.intent)) notify(`Undone: ${last.label}`, "success");
		};
		return { run, undo: undoLast };
	}, [client, projectId, viewId]);
}
