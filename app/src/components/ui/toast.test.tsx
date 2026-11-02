// @vitest-environment happy-dom
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { button, click } from "@/test-support";
import { ErrorToast, Toaster } from "./toast";

test("closing an error hides it until it changes or recovers", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const retry = vi.fn();
  const show = (message: string | null, pending = false) =>
    flushSync(() =>
      root.render(
        <>
          <ErrorToast
            message={message}
            pending={pending}
            onRetry={retry}
          />
          <Toaster />
        </>,
      ),
    );

  document.body.append(container);

  try {
    show("Cache unavailable");

    await expect
      .poll(() => container.querySelector('[role="alert"]')?.textContent)
      .toContain("Cache unavailable");
    click(button("Dismiss notification", container));

    await expect.poll(() => container.querySelector('[role="alert"]')).toBeNull();
    show("Cache unavailable", true);
    await vi.advanceTimersByTimeAsync(100);

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(retry).not.toHaveBeenCalled();

    show("Disk full");

    await expect
      .poll(() => container.querySelector('[role="alert"]')?.textContent)
      .toContain("Disk full");
    click(button("Dismiss notification", container));
    show(null);
    show("Disk full");

    await expect
      .poll(() => container.querySelector('[role="alert"]')?.textContent)
      .toContain("Disk full");
  } finally {
    flushSync(() => root.unmount());
    container.remove();
  }
});
