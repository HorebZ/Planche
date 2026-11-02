// @vitest-environment happy-dom

import { expect, test } from "vitest";
import { useDrafts } from "@/stores/drafts";
import { useUi } from "@/stores/ui";
import { button, calls, click, installMockBackend, render } from "@/test-support";
import { Updates } from "./Updates";

test("updates work while signed out and preserve unsent drafts before restart", async () => {
  const backend = installMockBackend("onboarding");
  useUi.getState().setUpdatesOpen(true);
  render(<Updates />);

  await expect.poll(() => document.body.textContent).toContain("You’re up to date.");
  expect(calls.check_updates).toBe(1);
  expect(calls.auth_status).toBeUndefined();

  await backend.offerUpdate();
  await expect
    .poll(() => document.body.textContent)
    .toContain("Planche 0.1.0-alpha.2 is available.");
  click(button("Download update"));

  await expect.poll(() => document.body.textContent).toContain("Your update is ready to install.");
  useDrafts.getState().edit("draft", "Keep this text");

  await expect.poll(() => button("Install and restart").disabled).toBe(true);
  expect(document.body.textContent).toContain("Finish or discard your draft");
  expect(calls.install_update).toBeUndefined();

  useDrafts.getState().edit("draft", "");
  await expect.poll(() => button("Install and restart").disabled).toBe(false);
  click(button("Install and restart"));

  await expect.poll(() => calls.install_update).toBe(1);
});
