import { QueryClient, queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { commands, events, type ProjectId, type SyncPrefs, type SyncStatus, type ViewId } from "./bindings";

/** The cache in Rust is the source of truth, so queries refetch on events, not on a timer. */
export function createQueryClient() {
	return new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false, refetchOnWindowFocus: false } },
	});
}

export const queryClient = createQueryClient();

export const boardQuery = (projectId: ProjectId, viewId: ViewId | null) =>
	queryOptions({ queryKey: ["board", projectId, viewId], queryFn: () => commands.getBoard(projectId, viewId) });

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

/** Keeps the queries in step with the events Rust emits. Returns the unsubscribe function. */
export async function listenToCore(client: QueryClient) {
	const unlisten = await Promise.all([
		events.boardChanged.listen(({ payload }) => {
			client.invalidateQueries({ queryKey: ["board", payload.project_id] });
			client.invalidateQueries({ queryKey: ["project", payload.project_id] });
		}),
		events.syncStatus.listen(({ payload }) => {
			client.setQueryData<SyncStatus>(syncStatusQuery.queryKey, payload);
		}),
		events.mutationFailed.listen(({ payload }) => {
			toast.error(`A move failed and was undone: ${payload.message}`);
		}),
	]);
	return () => {
		for (const stop of unlisten) stop();
	};
}
