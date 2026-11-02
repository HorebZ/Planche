import { useEffect, useState } from "react";
import { ErrorToast } from "@/components/ui/toast";

export function SyncErrorToast({
  message,
  retryAt,
  onRetry,
  pending = false,
}: {
  message: string | null;
  retryAt: number | null;
  onRetry: () => void;
  pending?: boolean;
}) {
  const seconds = useCountdown(retryAt);
  const offline = message === "Offline" || message?.startsWith("Offline ·");
  const description = offline
    ? `Changes are kept locally.${seconds != null ? ` Retrying in ${seconds}s` : ""}`
    : "Showing saved data";

  return (
    <ErrorToast
      message={offline ? "Can't reach api.github.com" : message}
      description={description}
      pending={pending}
      onRetry={onRetry}
    />
  );
}

/** Whole seconds until `at`, ticking every second. */
function useCountdown(at: number | null) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (at == null) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [at]);

  return at == null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}
