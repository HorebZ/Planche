import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ToastCard, toast } from "@/components/ui/toast";
import { UpdateContent } from "@/components/ui/update";
import { commands, events, type UpdateStatus } from "@/ipc/bindings.types";
import { errorMessage, queryClient } from "@/ipc/queries";
import { useDrafts } from "@/stores/drafts";
import { useUi } from "@/stores/ui";
import pkg from "../../package.json";

const key = ["updates"] as const;

export function showUpdates() {
  useUi.getState().setUpdatesOpen(true);
  void queryClient.refetchQueries({ queryKey: key });
}

export function Updates() {
  const client = useQueryClient();
  const open = useUi((state) => state.updatesOpen);
  const blocked = useDrafts((state) =>
    Object.values(state.entries).some((entry) => Boolean(entry.title.trim() || entry.ticket)),
  );
  const query = useQuery({
    queryKey: key,
    queryFn: () => commands.checkUpdates(),
    networkMode: "always",
    refetchOnMount: "always",
  });
  const status: UpdateStatus = query.data ?? {
    current_version: pkg.version,
    phase: query.isPending ? "checking" : "error",
    release: null,
    received: 0,
    total: null,
    error: query.error ? errorMessage(query.error) : null,
  };
  const notified = useRef("");
  const setStatus = (status: UpdateStatus) => client.setQueryData(key, status);
  const failed = (error: unknown) =>
    setStatus({ ...status, phase: "error", error: errorMessage(error) });
  const download = useMutation({
    mutationFn: () => commands.downloadUpdate(),
    networkMode: "always",
    onSuccess: setStatus,
    onError: failed,
  });
  const install = useMutation({
    mutationFn: () => commands.installUpdate(),
    networkMode: "always",
    onMutate: () => setStatus({ ...status, phase: "installing", error: null }),
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
          onDownload={() => download.mutate()}
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
