import { QueryClient, queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { cardRect } from "@/board/flip";
import { notify } from "@/components/ui/toast";
import { useUi } from "@/stores/ui";
import { verbs } from "@/undo/inverse";
import {
	type AuthStatus,
	type Board,
	commands,
	events,
	type ProjectId,
	type SyncPrefs,
	type SyncStatus,
	type ViewId,
} from "./bindings";

type Gate = { generation: number; sending: Set<object>; tail: Promise<void>; wake: Set<() => void> };
const coordination = new WeakMap<QueryClient, { accountEpoch: number; gates: Map<ProjectId, Gate> }>();
function state(client: QueryClient) {
	let value = coordination.get(client);
	if (!value) {
		value = { accountEpoch: 0, gates: new Map() };
		coordination.set(client, value);
	}
	return value;
}
function gateFor(client: QueryClient, projectId: ProjectId) {
	const gates = state(client).gates;
	let gate = gates.get(projectId);
	if (!gate) {
		gate = { generation: 0, sending: new Set(), tail: Promise.resolve(), wake: new Set() };
		gates.set(projectId, gate);
	}
	return gate;
}
export function boardAccountEpoch(client: QueryClient) {
	return state(client).accountEpoch;
}
export function reconcileBoard(client: QueryClient, projectId: ProjectId, epoch: number) {
	if (boardAccountEpoch(client) !== epoch) return;
	const gate = gateFor(client, projectId);
	gate.generation++;
	for (const wake of gate.wake) wake();
	void client.invalidateQueries({ queryKey: ["board", projectId] });
}
export function beginBoardWrite(client: QueryClient, projectId: ProjectId, prepareAndSend: () => void) {
	const accountEpoch = boardAccountEpoch(client);
	const gate = gateFor(client, projectId);
	const token = {};
	gate.sending.add(token);
	gate.generation++;
	const release = () => {
		if (gate.sending.delete(token)) reconcileBoard(client, projectId, accountEpoch);
	};
	const prepared = gate.tail.then(async () => {
		// An old account's queued write must not cancel the new account's reads.
		if (boardAccountEpoch(client) !== accountEpoch) throw new Error("Account changed before sending");
		// Preserve optimism and keep cancellation out of the visible query error.
		await client.cancelQueries({ queryKey: ["board", projectId] }, { revert: false, silent: true });
		if (boardAccountEpoch(client) !== accountEpoch) throw new Error("Account changed before sending");
		prepareAndSend();
	});
	gate.tail = prepared.catch(release);
	return { accountEpoch, prepared, release };
}
function waitForBoard(gate: Gate, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted();
	if (!gate.sending.size) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			gate.wake.delete(wake);
			signal.removeEventListener("abort", abort);
		};
		const wake = () => {
			cleanup();
			resolve();
		};
		const abort = () => {
			cleanup();
			reject(signal.reason);
		};
		gate.wake.add(wake);
		signal.addEventListener("abort", abort, { once: true });
	});
}

/** The cache in Rust is the source of truth, so queries refetch on events, not on a timer. */
export function createQueryClient() {
	const client = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false, refetchOnWindowFocus: false } },
	});
	let identity: string | null = null;
	client.getQueryCache().subscribe((event) => {
		if (event.query.queryKey.length !== 1 || event.query.queryKey[0] !== "auth") return;
		const next = client.getQueryData<AuthStatus>(["auth"])?.id ?? null;
		if (next === identity) return;
		identity = next;
		const current = state(client);
		current.accountEpoch++;
		void client.cancelQueries({ queryKey: ["board"] }, { revert: false, silent: true });
		client.removeQueries({ queryKey: ["board"] });
		for (const gate of current.gates.values()) for (const wake of gate.wake) wake();
		current.gates.clear();
		useUi.getState().invalidateUndo();
	});
	return client;
}

export const queryClient = createQueryClient();

export const boardQuery = (projectId: ProjectId, viewId: ViewId | null) =>
	queryOptions({
		queryKey: ["board", projectId, viewId],
		queryFn: async ({ client, signal }) => {
			for (;;) {
				const gate = gateFor(client, projectId);
				await waitForBoard(gate, signal);
				signal.throwIfAborted();
				if (gate.sending.size) continue;
				const epoch = boardAccountEpoch(client);
				const generation = gate.generation;
				// A write can begin while getBoard is pending; discard that older result or error.
				try {
					const board = await commands.getBoard(projectId, viewId);
					signal.throwIfAborted();
					if (epoch === boardAccountEpoch(client) && generation === gate.generation) return board;
				} catch (error) {
					signal.throwIfAborted();
					if (epoch === boardAccountEpoch(client) && generation === gate.generation) throw error;
				}
			}
		},
	});

/** Who can be assigned in `repo`. Fetched from GitHub once per session. */
export const assignableUsersQuery = (repo: string) =>
	queryOptions({ queryKey: ["assignable-users", repo], queryFn: () => commands.listAssignableUsers(repo) });

export const projectQuery = (projectId: ProjectId) =>
	queryOptions({ queryKey: ["project", projectId], queryFn: () => commands.getProject(projectId) });

export const authQuery = queryOptions({ queryKey: ["auth"], queryFn: () => commands.authStatus() });
export const projectsQuery = queryOptions({ queryKey: ["projects"], queryFn: () => commands.listProjects() });
const cachedProjectsQuery = queryOptions({
	queryKey: ["projects", "cached"],
	queryFn: () => commands.cachedProjects(),
});
export const currentProjectQuery = queryOptions({
	queryKey: ["current-project"],
	queryFn: () => commands.currentProject(),
});
export const syncPrefsQuery = queryOptions({ queryKey: ["sync-prefs"], queryFn: () => commands.getSyncPrefs() });
/** Seeded by `sync_status`, then kept current by the `sync-status` event. */
export const syncStatusQuery = queryOptions({ queryKey: ["sync-status"], queryFn: () => commands.syncStatus() });

export function useBoard(projectId: ProjectId | null, viewId: ViewId | null) {
	return useQuery({ ...boardQuery(projectId ?? "", viewId), enabled: projectId != null });
}

export function useProject(projectId: ProjectId | null) {
	return useQuery({ ...projectQuery(projectId ?? ""), enabled: projectId != null });
}

export function useAuth() {
	return useQuery(authQuery);
}

/** GitHub's list, with the cached projects until it arrives. It takes seconds with many organizations. */
export function useProjects(enabled = true) {
	const cached = useQuery({ ...cachedProjectsQuery, enabled });
	const listed = useQuery({ ...projectsQuery, enabled });
	return { ...listed, data: listed.data ?? cached.data };
}

export function useCurrentProject() {
	return useQuery(currentProjectQuery);
}

export function useSyncStatus() {
	return useQuery(syncStatusQuery);
}

export function useSyncPrefs() {
	return useQuery(syncPrefsQuery);
}

export function useSetSyncPrefs() {
	return useMutation({
		mutationFn: (prefs: SyncPrefs) => commands.setSyncPrefs(prefs),
		onSuccess: (prefs) => queryClient.setQueryData(syncPrefsQuery.queryKey, prefs),
	});
}

export function useRefresh() {
	return useMutation({ mutationFn: (projectId: ProjectId) => commands.refreshProject(projectId) });
}

export function useOpenProject() {
	return useMutation({
		mutationFn: (projectId: ProjectId) => commands.openProject(projectId),
		onSuccess: (_, projectId) => queryClient.setQueryData(currentProjectQuery.queryKey, projectId),
	});
}

/** The message of a command error, which is an `AppError`. */
export function errorMessage(error: unknown) {
	return typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
}

/** The title of a card in any cached board, for a toast. */
function cardTitle(client: QueryClient, itemId: string) {
	for (const [, board] of client.getQueriesData<Board | null>({ queryKey: ["board"] })) {
		const card = board?.columns.flatMap((c) => c.cards).find((c) => c.item_id === itemId);
		if (card) return card.kind === "redacted" ? "Redacted item" : card.title;
	}
	return "the card";
}

/** Keeps the queries in step with the events Rust emits. Returns the unsubscribe function. */
export async function listenToCore(client: QueryClient) {
	// Board changes that arrive while a card is lifted, applied after the drop.
	const deferred = new Set<string>();
	const refresh = (projectId: string) =>
		Promise.all([
			client.invalidateQueries({ queryKey: ["board", projectId] }),
			client.invalidateQueries({ queryKey: ["project", projectId] }),
		]);
	const stopDrop = useUi.subscribe((state, previous) => {
		if (previous.dragging && !state.dragging) {
			for (const projectId of deferred) refresh(projectId);
			deferred.clear();
		}
	});
	const unlisten = await Promise.all([
		events.boardChanged.listen(({ payload }) => {
			if (useUi.getState().dragging) deferred.add(payload.project_id);
			else refresh(payload.project_id);
		}),
		events.syncStatus.listen(({ payload }) => {
			client.setQueryData<SyncStatus>(syncStatusQuery.queryKey, payload);
		}),
		events.mutationFailed.listen(({ payload }) => {
			// Rust has dropped the row; the board-changed that follows brings the card back, and
			// the board slides it from where it is now.
			const id = payload.intent.item_id;
			const from = cardRect(id);
			if (from) useUi.getState().setReverting({ id, from });
			const verb = verbs[payload.intent.type];
			notify(`Couldn't ${verb} "${cardTitle(client, payload.intent.item_id)}". Reverted.`, "error");
		}),
	]);
	return () => {
		stopDrop();
		for (const stop of unlisten) stop();
	};
}
