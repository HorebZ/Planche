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
import { useSettledError } from "@/lib/useSettledError";
import { Onboarding } from "@/onboarding/Onboarding";
import { RepositoryShell } from "@/shell/RepositoryShell";
import { Shell } from "@/shell/Shell";
import { usePreferences } from "@/stores/preferences";
import { useRepositoryViews } from "@/stores/repository-views";
import { useUi } from "@/stores/ui";
import { Updates } from "@/update/Updates";

export default function App() {
  const theme = usePreferences((s) => s.theme);
  const highContrast = usePreferences((s) => s.highContrast);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");

    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);
  useEffect(() => {
    if (highContrast) {
      document.documentElement.dataset.contrast = "high";
    } else {
      delete document.documentElement.dataset.contrast;
    }
  }, [highContrast]);
  useEffect(() => {
    const stop = listenToCore(queryClient);

    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Root />
      <Updates />
      <Toaster />
    </QueryClientProvider>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  const auth = useQuery({ ...authQuery, enabled: ready });

  useEffect(() => {
    // Paint the loading screen before restoring the saved session.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setReady(true));
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const current = useCurrentProject();
  const repository = useRepositoryViews((state) => state.active);
  const picked = useUi((s) => s.projectId);
  const projectId = picked ?? current.data ?? null;
  const open = useOpenProject();
  const authError = useSettledError(
    auth.error ? errorMessage(auth.error) : null,
    auth.isFetching,
    "auth",
  );

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
        error={authError ?? undefined}
        onUnlock={() => void auth.refetch()}
      />
    );
  }

  if (auth.data?.id && repository?.account === auth.data.id) {
    return (
      <RepositoryShell
        key={`${repository.account}:${repository.repository}`}
        account={repository.account}
        id={repository.repository}
      />
    );
  }

  if (!auth.data?.login || !projectId) {
    return (
      <Onboarding
        accountId={auth.data?.id}
        signedIn={Boolean(auth.data?.login)}
      />
    );
  }

  return (
    <Shell
      key={auth.data?.id}
      projectId={projectId}
    />
  );
}
