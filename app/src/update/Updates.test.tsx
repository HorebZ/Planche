// @vitest-environment happy-dom

import { expect, test, vi } from "vitest";
import { updateStatus } from "@/ipc/_fixtures/update.fixtures";
import { commands, type UpdateStatus } from "@/ipc/bindings.types";
import { useDrafts } from "@/stores/drafts";
import { useUi } from "@/stores/ui";
import { button, calls, click, get, installMockBackend, render } from "@/test-support";
import { UpdateButton, Updates } from "./Updates";

test("updates work while signed out and preserve unsent drafts before restart", async () => {
  const backend = installMockBackend("onboarding");
  useUi.getState().setUpdatesOpen(true);
  render(<Updates />);

  await expect.poll(() => document.body.textContent).toContain("You’re up to date.");
  expect(calls.check_updates).toBe(1);
  expect(calls.auth_status).toBeUndefined();

  await backend.offerUpdate();
  useDrafts.getState().edit("draft", "Keep this text");

  await expect.poll(() => button("Install and restart").disabled).toBe(true);
  expect(document.body.textContent).toContain("Finish or discard your draft");
  expect(document.body.textContent).toContain("0.1.0-alpha.1 → 0.1.0-alpha.2");
  expect(document.body.textContent).toContain("Alpha fixes and improvements.");
  expect(calls.download_update).toBeUndefined();
  expect(calls.install_update).toBeUndefined();

  useDrafts.getState().edit("draft", "");
  await expect.poll(() => button("Install and restart").disabled).toBe(false);
  click(button("Install and restart"));

  await expect.poll(() => calls.install_update).toBe(1);
  expect(calls.download_update).toBe(1);
  await expect.poll(() => document.body.textContent).toContain("Installing update…");
});

test("the footer button checks in place and opens an offered release without checking again", async () => {
  const backend = installMockBackend("board");
  render(
    <>
      <UpdateButton />
      <Updates />
    </>,
  );
  await expect.poll(() => button("Check for updates").disabled).toBe(false);
  let finishCheck!: (status: UpdateStatus) => void;
  vi.spyOn(commands, "checkUpdates").mockImplementationOnce(
    () => new Promise((resolve) => (finishCheck = resolve)),
  );

  click(button("Check for updates"));

  await expect.poll(() => button("Checking for updates…").disabled).toBe(true);
  expect(get('[data-slot="update-indicator"] svg').classList.contains("animate-pl-spin")).toBe(
    true,
  );
  expect(useUi.getState().updatesOpen).toBe(false);

  finishCheck(updateStatus());
  await expect.poll(() => button("Check for updates").disabled).toBe(false);
  await backend.offerUpdate();
  await expect.poll(() => document.querySelector('[data-slot="update-badge"]')).not.toBeNull();
  click(button("Planche 0.1.0-alpha.2 available"));

  await expect.poll(() => document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain("0.1.0-alpha.1 → 0.1.0-alpha.2");
  expect(calls.check_updates).toBe(1);
});

test("a failed check leaves the footer button available to review and retry", async () => {
  installMockBackend("board");
  vi.spyOn(commands, "checkUpdates").mockRejectedValueOnce(new Error("No connection"));
  render(
    <>
      <UpdateButton />
      <Updates />
    </>,
  );

  await expect.poll(() => button("Update check failed").disabled).toBe(false);
  click(button("Update check failed"));

  await expect.poll(() => document.body.textContent).toContain("No connection");
  click(button("Try again"));

  await expect.poll(() => document.body.textContent).toContain("You’re up to date.");
});

test("a failed download never installs the update", async () => {
  const backend = installMockBackend("onboarding");
  useUi.getState().setUpdatesOpen(true);
  render(<Updates />);
  await expect.poll(() => document.body.textContent).toContain("You’re up to date.");
  await backend.offerUpdate();
  vi.spyOn(commands, "downloadUpdate").mockRejectedValueOnce(new Error("Download interrupted"));
  await expect.poll(() => button("Install and restart").disabled).toBe(false);

  click(button("Install and restart"));

  await expect.poll(() => document.body.textContent).toContain("Download interrupted");
  expect(button("Try again").disabled).toBe(false);
  expect(calls.install_update).toBeUndefined();
});

test("a draft created during download blocks restart and keeps the downloaded update", async () => {
  const backend = installMockBackend("onboarding");
  useUi.getState().setUpdatesOpen(true);
  render(<Updates />);
  await expect.poll(() => document.body.textContent).toContain("You’re up to date.");
  await backend.offerUpdate();
  let finishDownload!: (status: UpdateStatus) => void;
  const download = vi
    .spyOn(commands, "downloadUpdate")
    .mockImplementationOnce(() => new Promise((resolve) => (finishDownload = resolve)));
  await expect.poll(() => button("Install and restart").disabled).toBe(false);

  click(button("Install and restart"));
  await expect.poll(() => document.body.textContent).toContain("Downloading update…");
  useDrafts.getState().edit("draft", "Written while downloading");
  finishDownload(
    updateStatus({ phase: "ready", release: { version: "0.1.0-alpha.2", notes: "Fixes." } }),
  );

  await expect.poll(() => button("Install and restart").disabled).toBe(true);
  expect(calls.install_update).toBeUndefined();

  useDrafts.getState().edit("draft", "");
  await expect.poll(() => button("Install and restart").disabled).toBe(false);
  click(button("Install and restart"));

  await expect.poll(() => calls.install_update).toBe(1);
  expect(download).toHaveBeenCalledTimes(1);
});
