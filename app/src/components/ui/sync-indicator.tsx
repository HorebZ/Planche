import { CloudCheck, CloudOff } from "lucide-react";
import type { ComponentProps } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

export type SyncIndicatorState = "idle" | "busy" | "offline";

type SyncIndicatorProps = ComponentProps<"span"> & {
  state: SyncIndicatorState;
  /** "Syncing 3 of 5…" or "Loading 142 items…" while busy. */
  label?: string;
};

/** The sync state in the toolbar: up to date, a spinner with progress, or offline. */
export function SyncIndicator({ state, label, className, ...props }: SyncIndicatorProps) {
  return (
    <span
      data-slot="sync-indicator"
      data-state={state}
      role="status"
      className={cn(
        "flex items-center gap-[5px] px-1.5 text-[11.5px]",
        state === "offline" ? "font-medium text-danger" : "text-fg-3",
        state === "busy" && "gap-1.5",
        className,
      )}
      {...props}
    >
      {state === "idle" ? (
        <CloudCheck
          className="size-[15px]"
          aria-hidden
        />
      ) : null}
      {state === "busy" ? <Spinner size={11} /> : null}
      {state === "offline" ? (
        <CloudOff
          className="size-[15px]"
          aria-hidden
        />
      ) : null}
      {label ?? (state === "offline" ? "Offline" : "Up to date")}
    </span>
  );
}
