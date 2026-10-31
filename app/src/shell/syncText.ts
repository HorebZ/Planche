import type { SyncStatus } from "@/ipc/bindings.types";

/** "just now", "2 min ago", "3 h ago". */
export function ago(ms: number, now = Date.now()) {
  const minutes = Math.floor((now - ms) / 60_000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  return `${Math.floor(minutes / 60)} h ago`;
}

/** The sidebar footer text and tone. `syncedAt` is the cache's last sync, for a cold start. */
export function footerText(
  status: SyncStatus | undefined,
  syncedAt: string | null,
  now = Date.now(),
  error?: string | null,
) {
  if (error) {
    return { tone: "offline", text: error } as const;
  }

  const pending = status?.pending ?? 0;
  const changes = pending === 1 ? "1 change pending" : `${pending} changes pending`;

  switch (status?.state.type) {
    case "syncing":
      return { tone: "syncing", text: "Syncing…" } as const;
    case "offline":
      return { tone: "offline", text: pending > 0 ? `Offline · ${changes}` : "Offline" } as const;
    case "rate_limited":
      return { tone: "offline", text: "Rate limited by GitHub" } as const;
    case "error":
      return { tone: "offline", text: status.state.message } as const;
  }

  const last = status?.last_sync_at ?? (syncedAt ? Date.parse(syncedAt) : null);

  return { tone: "ok", text: last ? `Synced ${ago(last, now)}` : "Not synced yet" } as const;
}

/** The toolbar label while busy: "Loading 142 items…" before the first sync, "Syncing 3 of 5…" after. */
export function busyLabel(status: SyncStatus | undefined, loading: boolean) {
  if (status?.state.type !== "syncing") {
    return null;
  }

  const { page, pages, items_total } = status.state;

  if (loading) {
    return items_total > 0 ? `Loading ${items_total} items…` : "Loading project…";
  }

  return pages > 1 ? `Syncing ${page} of ${pages}…` : "Syncing…";
}
