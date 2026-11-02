import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ToastCard, toast } from "@/components/ui/toast";
import { UpdateContent, UpdateIndicator } from "@/components/ui/update";
import { commands, events, type UpdateStatus } from "@/ipc/bindings.types";
import { errorMessage, queryClient } from "@/ipc/queries";
import { useDrafts } from "@/stores/drafts";
import { useUi } from "@/stores/ui";
import pkg from "../../package.json";

const key = ["updates"] as const;

export function showUpdates() {
  useUi.getState().setUpdatesOpen(true);

  if (!queryClient.getQueryData<UpdateStatus>(key)?.release) {
    void queryClient.refetchQueries({ queryKey: key });
  }
}

function useUpdateStatus(enabled: boolean) {
  const query = useQuery({
    queryKey: key,
    queryFn: () => commands.checkUpdates(),
    networkMode: "always",
    refetchOnMount: enabled ? "always" : false,
    enabled,
  });
  const status: UpdateStatus = {
    current_version: pkg.version,
    phase: "checking",
    release: null,
    received: 0,
    total: null,
    error: null,
    ...query.data,
    ...(query.isError
      ? { phase: "error", error: errorMessage(query.error) }
      : query.isFetching
        ? { phase: "checking" }
        : {}),
  };

  return { query, status };
}

export function UpdateButton() {
  const client = useQueryClient();
  const { status } = useUpdateStatus(false);

  return (
    <UpdateIndicator
      status={status}
      onClick={() => {
        if (status.release || status.phase === "error") {
          useUi.getState().setUpdatesOpen(true);
        } else {
          void client.refetchQueries({ queryKey: key });
        }
      }}
    />
  );
}

export function Updates() {
  const client = useQueryClient();
  const open = useUi((state) => state.updatesOpen);
  const blocked = useDrafts((state) =>
    Object.values(state.entries).some((entry) => Boolean(entry.title.trim() || entry.ticket)),
  );
  const { query, status } = useUpdateStatus(true);
  const notified = useRef("");
  const setStatus = (status: UpdateStatus) => client.setQueryData(key, status);
  const failed = (error: unknown) =>
    setStatus({
      ...(client.getQueryData<UpdateStatus>(key) ?? status),
      phase: "error",
      error: errorMessage(error),
    });
  const install = useMutation({
    mutationFn: async () => {
      let latest = client.getQueryData<UpdateStatus>(key) ?? status;

      if (latest.phase === "available") {
        setStatus({ ...latest, phase: "downloading", error: null });
        latest = await commands.downloadUpdate();
        setStatus(latest);
      }

      if (
        latest.phase !== "ready" ||
        Object.values(useDrafts.getState().entries).some((entry) =>
          Boolean(entry.title.trim() || entry.ticket),
        )
      ) {
        return;
      }

      setStatus({ ...latest, phase: "installing", error: null });
      await commands.installUpdate();
    },
    networkMode: "always",
    onError: failed,
  });

  useEffect(() => {
    const stop = events.updateChanged.listen(({ payload }) => client.setQueryData(key, payload));

    return () => {
      void stop.then((unlisten) => unlisten());
    };
  }, [client]);
  useEffect(() => {
    if ((status.phase !== "available" && status.phase !== "ready") || !status.release) {
      return;
    }

    const notification = `${status.phase}:${status.release.version}`;

    if (notified.current === notification || open) {
      return;
    }

    notified.current = notification;
    toast.custom(
      (id) => (
        <ToastCard
          message={`Planche ${status.release?.version} ${status.phase === "ready" ? "is ready to install" : "is available"}`}
          action={{
            label: "Review",
            onClick: () => {
              useUi.getState().setUpdatesOpen(true);
              toast.dismiss(id);
            },
          }}
        />
      ),
      { duration: 10000 },
    );
  }, [status.phase, status.release, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (status.phase !== "installing") {
          useUi.getState().setUpdatesOpen(value);
        }
      }}
    >
      <DialogContent showClose={status.phase !== "installing"}>
        <DialogTitle>Planche updates</DialogTitle>
        <DialogDescription>Get the latest alpha release.</DialogDescription>
        <UpdateContent
          status={status}
          blocked={blocked}
          onCheck={() => void query.refetch()}
          onInstall={() => {
            if (!blocked) {
              install.mutate();
            }
          }}
          onClose={() => useUi.getState().setUpdatesOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
