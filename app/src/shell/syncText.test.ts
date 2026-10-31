import { expect, test } from "vitest";
import type { SyncStatus } from "@/ipc/bindings";
import { ago, busyLabel, footerText } from "./syncText";

const now = Date.parse("2026-10-15T12:00:00Z");
const status = (state: SyncStatus["state"], extra: Partial<SyncStatus> = {}): SyncStatus => ({
  state,
  last_sync_at: null,
  retry_at: null,
  pending: 0,
  ...extra,
});

test("relative times", () => {
  expect(ago(now - 20_000, now)).toBe("just now");
  expect(ago(now - 150_000, now)).toBe("2 min ago");
  expect(ago(now - 3 * 3_600_000, now)).toBe("3 h ago");
});

test("the footer says how fresh the board is, or why it is not", () => {
  expect(footerText(status({ type: "idle" }, { last_sync_at: now - 120_000 }), null, now)).toEqual({
    tone: "ok",
    text: "Synced 2 min ago",
  });
  expect(footerText(undefined, "2026-10-15T11:55:00Z", now).text).toBe("Synced 5 min ago");
  expect(footerText(undefined, null, now).text).toBe("Not synced yet");
  expect(footerText(status({ type: "offline" }, { pending: 1 }), null, now)).toEqual({
    tone: "offline",
    text: "Offline · 1 change pending",
  });
  expect(footerText(status({ type: "offline" }, { pending: 3 }), null, now).text).toBe(
    "Offline · 3 changes pending",
  );
  expect(
    footerText(status({ type: "syncing", page: 1, pages: 1, items_total: 9 }), null, now).tone,
  ).toBe("syncing");
});

test("the toolbar counts items while loading and pages while syncing", () => {
  const syncing = status({ type: "syncing", page: 3, pages: 5, items_total: 480 });

  expect(busyLabel(syncing, true)).toBe("Loading 480 items…");
  expect(busyLabel(syncing, false)).toBe("Syncing 3 of 5…");
  expect(busyLabel(status({ type: "syncing", page: 1, pages: 1, items_total: 9 }), false)).toBe(
    "Syncing…",
  );
  expect(busyLabel(status({ type: "idle" }), false)).toBeNull();
});

test("quota, sync failures and local read errors override a successful sync", () => {
  expect(footerText(status({ type: "rate_limited" }), null)).toEqual({
    tone: "offline",
    text: "Rate limited by GitHub",
  });
  expect(footerText(status({ type: "error", message: "Token rejected" }), null)).toEqual({
    tone: "offline",
    text: "Token rejected",
  });
  expect(
    footerText(status({ type: "idle" }, { last_sync_at: now }), null, now, "Cache unavailable"),
  ).toEqual({
    tone: "offline",
    text: "Cache unavailable",
  });
  expect(
    footerText(
      status({ type: "syncing", page: 1, pages: 1, items_total: 9 }),
      null,
      now,
      "Cache unavailable",
    ).tone,
  ).toBe("offline");
});
