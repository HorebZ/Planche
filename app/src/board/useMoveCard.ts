import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { notify } from "@/components/ui/toast";
import { type Board, commands, type Intent, type ProjectId, type ViewId } from "@/ipc/bindings";
import { boardQuery, errorMessage } from "@/ipc/queries";
import { moveCard } from "./moveCard";

/**
 * Moves a card at once in the cached board, then queues the move in Rust. Rust's board,
 * with the move replayed on the server state, replaces the optimistic one.
 */
export async function dispatchMove(client: QueryClient, projectId: ProjectId, viewId: ViewId | null, intent: Intent) {
	const key = boardQuery(projectId, viewId).queryKey;
	// A refetch in flight would overwrite the optimistic board with an older one.
	void client.cancelQueries({ queryKey: key });
	const before = client.getQueryData<Board | null>(key);
	if (before) client.setQueryData(key, markPending(moveCard(before, intent), intent.item_id));
	try {
		client.setQueryData(key, await commands.dispatchIntent(intent, viewId));
	} catch (error) {
		client.setQueryData(key, before);
		notify(`Couldn't move the card: ${errorMessage(error)}`, "error");
	}
}

/** The moved card says "Pending" where it was dropped, until Rust's board replaces this one. */
function markPending(board: Board, id: string): Board {
	return {
		...board,
		columns: board.columns.map((c) => ({
			...c,
			cards: c.cards.map((card) => (card.item_id === id ? { ...card, pending: true } : card)),
		})),
	};
}

export function useMoveCard(projectId: ProjectId, viewId: ViewId | null) {
	const client = useQueryClient();
	return useCallback((intent: Intent) => dispatchMove(client, projectId, viewId, intent), [client, projectId, viewId]);
}
