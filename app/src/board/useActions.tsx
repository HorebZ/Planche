import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { notify, ToastCard, toast } from "@/components/ui/toast";
import { type AuthStatus, type Board, commands, type Intent, type ProjectId, type ViewId } from "@/ipc/bindings";
import { authQuery, boardQuery, currentProjectQuery, errorMessage } from "@/ipc/queries";
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
	useEffect(() => {
		let previous = client.getQueryData(currentProjectQuery.queryKey);
		return client.getQueryCache().subscribe((event) => {
			if (event.query.queryKey[0] !== "current-project") return;
			const next = client.getQueryData(currentProjectQuery.queryKey);
			if (next !== previous && useUi.getState().projectId === null) useUi.getState().invalidateUndo();
			previous = next;
		});
	}, [client]);
	return useMemo(() => {
		const board = () => client.getQueryData<Board | null>(boardQuery(projectId, viewId).queryKey);
		const inContext = () => {
			const state = useUi.getState();
			return (
				(state.projectId ?? client.getQueryData(currentProjectQuery.queryKey) ?? projectId) === projectId &&
				state.viewId === viewId
			);
		};
		const identity = () => client.getQueryData<AuthStatus>(authQuery.queryKey)?.id;
		const run = async (intent: Intent) => {
			const owner = useUi.getState().claimAction();
			const account = identity();
			const before = board();
			const undo = before ? inverse(before, intent) : null;
			const label = before ? describe(before, intent) : "Done";
			if (!(await dispatchIntent(client, projectId, viewId, intent))) return;
			if (!inContext() || identity() !== account) return;
			if (!useUi.getState().acceptUndo(owner, undo && { owner, intent: undo, label })) return;
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
										void undoLast(owner);
									},
								}
							: undefined
					}
				/>
			));
		};
		const undoLast = async (expectedOwner?: number) => {
			if (!inContext()) return;
			const account = identity();
			const last = useUi.getState().takeUndo(expectedOwner);
			if (!last) return;
			const version = useUi.getState().actionVersion;
			toast.dismiss();
			if (await dispatchIntent(client, projectId, viewId, last.intent)) {
				if (inContext() && identity() === account && useUi.getState().actionVersion === version)
					notify(`Undone: ${last.label}`, "success");
			}
		};
		return { run, undo: undoLast };
	}, [client, projectId, viewId]);
}
