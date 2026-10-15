import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toast";
import { listenToCore, queryClient, useAuth, useCurrentProject, useOpenProject } from "@/ipc/queries";
import { Onboarding } from "@/onboarding/Onboarding";
import { Shell } from "@/shell/Shell";
import { useUi } from "@/stores/ui";

export default function App() {
	useEffect(() => {
		const stop = listenToCore(queryClient);
		return () => {
			stop.then((unlisten) => unlisten());
		};
	}, []);
	return (
		<QueryClientProvider client={queryClient}>
			<Root />
			<Toaster />
		</QueryClientProvider>
	);
}

function Root() {
	const auth = useAuth();
	const current = useCurrentProject();
	const picked = useUi((s) => s.projectId);
	const projectId = picked ?? current.data ?? null;
	const open = useOpenProject();

	// Starts the engine of the last project; Rust ignores a project already open.
	const { mutate } = open;
	useEffect(() => {
		if (projectId && auth.data?.login) mutate(projectId);
	}, [projectId, auth.data?.login, mutate]);

	if (auth.isPending || current.isPending) return null;
	if (!auth.data?.login || !projectId) return <Onboarding signedIn={Boolean(auth.data?.login)} />;
	return <Shell projectId={projectId} />;
}
