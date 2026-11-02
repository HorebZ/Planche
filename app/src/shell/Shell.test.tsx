// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/toast";
import type { Scenario } from "@/ipc/_fixtures/scenarios.fixtures";
import { type Board, commands } from "@/ipc/bindings.types";
import { listenToCore } from "@/ipc/queries";
import { button, click, get, installMockBackend, key, render } from "@/test-support";
import { Shell } from "./Shell";

function renderShell() {
  return render(
    <>
      <Shell projectId="PVT_planche" />
      <Toaster />
    </>,
  );
}

async function open(scenario: Scenario) {
  const backend = installMockBackend(scenario);
  const mounted = renderShell();
  const stop = await listenToCore(mounted.client);

  await expect
    .poll(() => document.querySelector('[data-slot="board-column"], [data-slot="board-error"]'))
    .not.toBeNull();

  return { ...mounted, ...backend, stop };
}

function expectFailure(message: string) {
  expect(get('[data-slot="sidebar-footer"]').textContent).toContain(message);
  expect(document.body.textContent).not.toContain("Up to date");
}

test.each([
  ["board", "Synced 2 min ago"],
  ["syncing", "Syncing…"],
  ["offline", "Offline · 1 change pending"],
  ["loading", "Syncing…"],
  ["empty", "Synced 2 min ago"],
] as const)(
  "%s renders the board state consistently across the shell",
  async (scenario, footer) => {
    installMockBackend(scenario);
    renderShell();

    await expect.poll(() => get('[data-slot="sidebar-footer"]').textContent).toContain(footer);
    expect(document.querySelector('[data-slot="sync-indicator"]')).toBeNull();

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
    await expect.poll(() => get('[data-slot="sidebar-footer"]').textContent).toContain(message);
    expectFailure(message);
    expect(document.querySelector('[data-slot="skeleton-column"]')).toBeNull();

    await expect.poll(() => button("Retry now").disabled).toBe(false);
    click(button("Retry now"));

    await expect.poll(() => get('[data-slot="sidebar-footer"]').textContent).toContain("Synced");
    await expect.poll(() => document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelectorAll('[data-slot="board-column"]')).toHaveLength(5);
  } finally {
    backend.stop();
  }
});

test.each(["offline", "rate_limited"] as const)("uncached %s leaves loading", async (type) => {
  const backend = installMockBackend("loading");
  const { client } = renderShell();
  const stop = await listenToCore(client);

  try {
    await expect.poll(() => get('[data-slot="sidebar-footer"]').textContent).toContain("Syncing…");
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
        .poll(() => get('[data-slot="sidebar-footer"]').textContent)
        .toContain("Could not start synchronization");
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
      expect(get('[data-slot="sidebar-footer"]').textContent).toContain("Synced");
    } finally {
      backend.stop();
    }
  },
);

test.each([false, true])(
  "retry keeps the same error until settled (cached: %s)",
  async (cached) => {
    const backend = await open(cached ? "board" : "board-error");

    try {
      if (cached) {
        backend.setBoardError(true);
        await backend.emit("board-changed", { project_id: "PVT_planche" });
      }

      await expect
        .poll(() => document.querySelector('[role="alert"]')?.textContent)
        .toContain("Could not read the local cache");

      const alert = get('[role="alert"]');
      const original = commands.getBoard;
      const read = vi.spyOn(commands, "getBoard");

      for (const outcome of ["same", "different", "success"] as const) {
        let resolve!: (board: Board | null) => void;
        let reject!: (error: unknown) => void;
        read.mockImplementationOnce(
          () =>
            new Promise((ok, fail) => {
              resolve = ok;
              reject = fail;
            }),
        );
        const previousMessage = alert.textContent;
        const reads = read.mock.calls.length;

        click(button("Retry now", alert));

        await expect.poll(() => alert.querySelector("button:disabled")).not.toBeNull();
        expect(document.querySelector('[role="alert"]')).toBe(alert);
        expect(alert.textContent).toContain(
          outcome === "success" ? "Disk is full" : "Could not read the local cache",
        );
        expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
        await expect.poll(() => read.mock.calls.length).toBe(reads + 1);

        if (outcome === "success") {
          backend.setBoardError(false);
          resolve(await original("PVT_planche", null));

          await expect.poll(() => document.querySelector('[role="alert"]')).toBeNull();
          expect(document.querySelectorAll('[data-slot="board-column"]')).toHaveLength(5);
        } else {
          reject({
            kind: "Cache",
            message: outcome === "same" ? "Could not read the local cache" : "Disk is full",
          });

          await expect.poll(() => button("Retry now", alert).disabled).toBe(false);
          expect(document.querySelector('[role="alert"]')).toBe(alert);
          if (outcome === "same") {
            expect(alert.textContent).toBe(previousMessage);
          } else {
            expect(alert.textContent).toContain("Disk is full");
            expect(alert.textContent).not.toContain("Could not read the local cache");
          }
        }
      }
    } finally {
      backend.stop();
    }
  },
);

test("a failed manual sync keeps one persistent toast throughout retry", async () => {
  const backend = await open("refresh-error");

  try {
    key("r", document, { metaKey: true });

    await expect
      .poll(() => document.querySelector('[role="alert"]')?.textContent)
      .toContain("Could not start synchronization");
    const alert = get('[role="alert"]');
    let reject!: (error: unknown) => void;
    vi.spyOn(commands, "refreshProject").mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );

    click(button("Retry now", alert));

    await expect.poll(() => button("Retry now", alert).disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')).toBe(alert);
    expect(alert.textContent).toContain("Could not start synchronization");
    await expect.poll(() => typeof reject).toBe("function");
    reject({ kind: "Network", message: "Could not start synchronization" });

    await expect.poll(() => button("Retry now", alert).disabled).toBe(false);
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    expect(document.querySelector('[role="alert"]')).toBe(alert);
  } finally {
    backend.stop();
  }
});
