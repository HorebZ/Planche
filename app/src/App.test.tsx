// @vitest-environment happy-dom
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import App from "./App";
import { queryClient } from "./ipc/queries";
import { button, calls, click, get, installMockBackend, key, render } from "./test-support";

test.each(["locked", "unlock-cancelled"] as const)(
  "%s starts behind the lock and only authenticates again on explicit retry",
  async (scenario) => {
    const backend = installMockBackend(scenario);

    render(
      <StrictMode>
        <App />
      </StrictMode>,
      queryClient,
    );

    await expect.poll(() => calls.auth_status).toBe(1);
    await expect
      .poll(() => document.querySelector('[role="dialog"]')?.textContent)
      .toContain(scenario === "locked" ? "Opening…" : "Authentication cancelled");
    expect(document.querySelectorAll('[data-slot="skeleton-column"]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-slot="issue-card"]')).toHaveLength(0);

    key("Escape");
    vi.useFakeTimers();
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(calls.auth_status).toBe(1);
    expect(calls.open_project).toBeUndefined();
    expect(calls.list_projects).toBeUndefined();
    expect(calls.refresh_project).toBeUndefined();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    vi.useRealTimers();

    if (scenario === "locked") {
      backend.unlock();
    } else {
      click(button("Retry"));
    }

    await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
    await expect.poll(() => document.querySelectorAll('[data-slot="board-column"]').length).toBe(5);
    expect(calls.auth_status).toBe(scenario === "locked" ? 1 : 2);
  },
);

test("an unavailable project returns to the picker and can open again", async () => {
  const backend = installMockBackend("board-error");

  render(<App />, queryClient);

  await expect.poll(() => document.querySelector('[data-slot="board-error"]')).not.toBeNull();
  click(button("Choose another project"));

  await expect.poll(() => document.body.textContent).toContain("Pick a project");
  backend.setBoardError(false);
  click(button("Planche — v1.21"));
  click(button("Open board↵"));

  await expect.poll(() => document.querySelector('[data-slot="board-error"]')).toBeNull();
  await expect.poll(() => get('[data-slot="board-column"]').textContent).toContain("Backlog");
});
