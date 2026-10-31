// @vitest-environment happy-dom
import { expect, test } from "vitest";
import type { Scenario } from "@/ipc/_fixtures/scenarios.fixtures";
import { listenToCore } from "@/ipc/queries";
import { button, calls, click, get, installMockBackend, key, render } from "@/test-support";
import { Shell } from "./Shell";

async function open(scenario: Scenario) {
  const backend = installMockBackend(scenario);
  const mounted = render(<Shell projectId="PVT_planche" />);
  const stop = await listenToCore(mounted.client);

  await expect.poll(() => calls.get_board).toBeGreaterThan(0);
  await expect
    .poll(() => document.querySelector('[data-slot="sync-indicator"]')?.textContent)
    .not.toBe("Loading project…");

  return { ...mounted, ...backend, stop };
}

function expectFailure(message: string) {
  expect(get('[data-slot="sync-indicator"]').textContent).toBe(message);
  expect(get('[data-slot="sidebar-footer"]').textContent).toContain(message);
  expect(document.body.textContent).not.toContain("Up to date");
}

test.each([
  ["board", "Up to date", "Synced 2 min ago"],
  ["syncing", "Syncing 3 of 5…", "Syncing…"],
  ["offline", "Offline", "Offline · 1 change pending"],
  ["loading", "Loading 142 items…", "Syncing…"],
  ["empty", "Up to date", "Synced 2 min ago"],
] as const)(
  "%s renders the board state consistently across the shell",
  async (scenario, indicator, footer) => {
    installMockBackend(scenario);
    render(<Shell projectId="PVT_planche" />);

    await expect.poll(() => get('[data-slot="sync-indicator"]').textContent).toBe(indicator);
    expect(get('[data-slot="sidebar-footer"]').textContent).toContain(footer);

    if (scenario === "loading") {
      expect(document.querySelectorAll('[data-slot="skeleton-column"]')).toHaveLength(5);
      expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
      expect(document.querySelector('[data-slot="issue-card"]')).toBeNull();
    } else if (scenario === "empty") {
      expect(document.body.textContent).toContain("This board is empty");
      expect(document.querySelectorAll('[data-slot="board-column"]')).toHaveLength(5);
      expect(get<HTMLButtonElement>('[data-slot="empty-board-card"] button').disabled).toBe(false);
    } else {
      expect(
        [...document.querySelectorAll('[data-slot="board-column-count"]')].map(
          (count) => count.textContent,
        ),
      ).toEqual(["6", "3", "3", "2", "3"]);

      click(button("List"));

      expect(document.querySelectorAll('[data-slot="issue-list-row"]')).toHaveLength(17);

      if (scenario === "offline") {
        expect(get('[data-item-id="PVTI_231"]').textContent).toContain("Pending");
        expect(get('[role="alert"]').textContent).toContain("Retrying in");
      }
    }
  },
);

test("a rejected initial read offers retry instead of an empty board", async () => {
  const backend = await open("board-error");

  try {
    await expect
      .poll(() => document.querySelector('[data-slot="board-error"]')?.textContent)
      .toContain("Could not read the local cache");
    expectFailure("Could not read the local cache");
    expect(document.querySelector('[data-slot="empty-board-card"]')).toBeNull();
    expect(document.querySelector('[data-slot="skeleton-column"]')).toBeNull();

    backend.setBoardError(false);
    click(button("Retry now", get('[data-slot="board-error"]')));

    await expect.poll(() => document.querySelector('[data-slot="board-error"]')).toBeNull();
    expect(document.querySelectorAll('[data-slot="board-column"]')).toHaveLength(5);
  } finally {
    backend.stop();
  }
});

test("a failed cache refresh preserves the saved board and recovers", async () => {
  const backend = await open("board");

  try {
    backend.setBoardError(true);
    await backend.emit("board-changed", { project_id: "PVT_planche" });

    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent)
      .toContain("Showing saved data");
    expectFailure("Could not read the local cache");
    expect(document.querySelectorAll('[data-slot="board-column"]')).toHaveLength(5);

    backend.setBoardError(false);
    click(button("Retry now", get('[role="alert"]')));

    await expect.poll(() => document.querySelector('[role="alert"]')).toBeNull();
  } finally {
    backend.stop();
  }
});

test.each([
  ["rate-limited", "Rate limited by GitHub"],
  ["sync-error", "Token rejected by GitHub (401)"],
  ["uncached-sync-error", "Token rejected by GitHub (401)"],
] as const)("%s reports failure consistently and retries", async (scenario, message) => {
  const backend = await open(scenario);

  try {
    await expect.poll(() => get('[data-slot="sync-indicator"]').textContent).toBe(message);
    expectFailure(message);
    expect(document.querySelector('[data-slot="skeleton-column"]')).toBeNull();

    await expect.poll(() => button("Retry now").disabled).toBe(false);
    click(button("Retry now"));

    await expect.poll(() => get('[data-slot="sync-indicator"]').textContent).toBe("Up to date");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelectorAll('[data-slot="board-column"]')).toHaveLength(5);
  } finally {
    backend.stop();
  }
});

test.each(["offline", "rate_limited"] as const)("uncached %s leaves loading", async (type) => {
  const backend = installMockBackend("loading");
  const { client } = render(<Shell projectId="PVT_planche" />);
  const stop = await listenToCore(client);

  try {
    await expect
      .poll(() => get('[data-slot="sync-indicator"]').textContent)
      .toBe("Loading 142 items…");
    expect(document.querySelectorAll('[data-slot="skeleton-column"]')).toHaveLength(5);

    await backend.emit("sync-status", {
      state: { type },
      pending: 0,
      last_sync_at: null,
      retry_at: null,
    });

    await expect.poll(() => document.querySelector('[data-slot="board-error"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="skeleton-column"]')).toBeNull();
    expectFailure(type === "offline" ? "Offline" : "Rate limited by GitHub");
  } finally {
    stop();
  }
});

test.each(["retry", "automatic"] as const)(
  "manual sync errors clear after %s recovery",
  async (recovery) => {
    const backend = await open("refresh-error");

    try {
      key("r", document, { metaKey: true });

      await expect
        .poll(() => get('[data-slot="sync-indicator"]').textContent)
        .toBe("Could not start synchronization");
      expectFailure("Could not start synchronization");
      expect(get('[role="alert"]').textContent).toContain("Showing saved data");

      if (recovery === "retry") {
        click(button("Retry now", get('[role="alert"]')));
      } else {
        await backend.emit("sync-status", {
          state: { type: "idle" },
          pending: 0,
          retry_at: null,
          last_sync_at: Date.now(),
        });
      }

      await expect.poll(() => document.querySelector('[role="alert"]')).toBeNull();
      expect(get('[data-slot="sync-indicator"]').textContent).toBe("Up to date");
    } finally {
      backend.stop();
    }
  },
);
