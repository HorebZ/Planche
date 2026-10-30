import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { keysFor } from "@/keyboard/shortcuts";

/** 5c: GitHub is unreachable. Moves stay queued, and the engine retries at `retryAt`. */
export function OfflineBanner({
  retryAt,
  onRetry,
}: {
  retryAt: number | null;
  onRetry: () => void;
}) {
  const seconds = useCountdown(retryAt);
  return (
    <Banner
      className="mx-3.5 mt-2.5"
      icon={<WifiOff />}
      title="Can't reach api.github.com"
      description="Changes are kept locally and will be pushed when you're back online."
      meta={seconds != null ? `Retrying in ${seconds}s` : undefined}
      action={
        <Button
          className="h-6 text-xs"
          onClick={onRetry}
        >
          Retry now
          <Kbd
            size="sm"
            className="text-fg-3"
          >
            {keysFor("sync.now").join("")}
          </Kbd>
        </Button>
      }
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
