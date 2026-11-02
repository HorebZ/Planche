import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UpdateStatus } from "@/ipc/bindings.types";

export function UpdateContent({
  status,
  blocked,
  onCheck,
  onDownload,
  onInstall,
  onClose,
}: {
  status: UpdateStatus;
  blocked: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onClose: () => void;
}) {
  const labels = {
    idle: "Check for alpha updates.",
    checking: "Checking for updates…",
    current: "You’re up to date.",
    available: `Planche ${status.release?.version ?? ""} is available.`,
    downloading: "Downloading update…",
    ready: "Your update is ready to install.",
    installing: "Installing update…",
    error: "The update could not complete.",
  };
  const busy =
    status.phase === "checking" || status.phase === "downloading" || status.phase === "installing";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg-3 text-sm">
        Installed version {status.current_version} · Alpha channel
      </p>
      <p
        role="status"
        className="font-medium"
      >
        {labels[status.phase]}
      </p>
      {status.error ? (
        <p
          role="alert"
          className="text-danger text-sm"
        >
          {status.error}
        </p>
      ) : null}
      {status.release?.notes ? (
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-fg-2 text-sm">
          {status.release.notes}
        </p>
      ) : null}
      {busy ? (
        <Progress
          aria-label={labels[status.phase]}
          className="w-full"
          value={
            status.phase === "downloading" && status.total
              ? (status.received / status.total) * 100
              : undefined
          }
        />
      ) : null}
      {status.phase === "downloading" ? (
        <p className="text-fg-3 text-xs tabular-nums">
          {(status.received / 1048576).toFixed(1)} MB downloaded
        </p>
      ) : null}
      {status.phase === "ready" ? (
        <p className="text-fg-2 text-sm">
          {blocked
            ? "Finish or discard your draft before restarting."
            : "Your account, preferences and queued actions will be kept."}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          disabled={status.phase === "installing"}
          onClick={onClose}
        >
          {status.phase === "current" || status.phase === "idle" ? "Close" : "Later"}
        </Button>
        {status.phase === "available" ? (
          <Button
            variant="primary"
            onClick={onDownload}
          >
            Download update
          </Button>
        ) : status.phase === "ready" ? (
          <Button
            variant="primary"
            disabled={blocked}
            onClick={onInstall}
          >
            Install and restart
          </Button>
        ) : !busy ? (
          <Button onClick={onCheck}>
            {status.phase === "error" ? "Try again" : "Check for updates"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
