import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LockedApp } from "@/components/ui/app-lock";
import { Toaster } from "@/components/ui/toast";
import {
  authQuery,
  errorMessage,
  listenToCore,
  queryClient,
  useCurrentProject,
  useOpenProject,
} from "@/ipc/queries";
import { Onboarding } from "@/onboarding/Onboarding";
import { Shell } from "@/shell/Shell";
import { usePreferences } from "@/stores/preferences";
import { useUi } from "@/stores/ui";

export default function App() {
  const theme = usePreferences((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");

    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);
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
  const [ready, setReady] = useState(false);
  const auth = useQuery({ ...authQuery, enabled: ready });

  useEffect(() => {
    // Leave a painted lock screen behind the native macOS prompt, even in StrictMode.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setReady(true));
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const current = useCurrentProject();
  const picked = useUi((s) => s.projectId);
  const projectId = picked ?? current.data ?? null;
  const open = useOpenProject();

  // Starts the engine of the last project; Rust ignores a project already open.
  const { mutate } = open;

  useEffect(() => {
    if (projectId && auth.isSuccess && !auth.isFetching && auth.data.login) {
      mutate(projectId);
    }
  }, [projectId, auth.isSuccess, auth.isFetching, auth.data?.login, mutate]);

  if (auth.isPending || auth.isError || current.isPending) {
    return (
      <LockedApp
        pending={auth.isPending || auth.isFetching || current.isPending}
        error={auth.error ? errorMessage(auth.error) : undefined}
        onUnlock={() => void auth.refetch()}
      />
    );
  }

  if (!auth.data?.login || !projectId) {
    return <Onboarding signedIn={Boolean(auth.data?.login)} />;
  }

  return <Shell projectId={projectId} />;
}
