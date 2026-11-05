// @vitest-environment happy-dom
import { expect, test } from "vitest";
import App from "@/App";
import { queryClient } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import {
  button,
  calls,
  click,
  fill,
  get,
  installMockBackend,
  key,
  render,
  submit,
} from "@/test-support";

async function open() {
  installMockBackend("accounts");
  render(<App />, queryClient);

  await expect.poll(() => document.querySelector('[data-slot="board"]')).not.toBeNull();
}

async function accountMenu(login: string) {
  key("Enter", button(`Planche account: ${login}`));
  await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
}

function accountItem(name: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (item) => item.textContent?.trim() === name,
  );
  if (!item) {
    throw new Error(`Missing account: ${name}`);
  }

  return item;
}

test("switching saved accounts preserves both connections and clears the previous account UI", async () => {
  await open();
  useUi.getState().select("old-item");
  await accountMenu("camille-r");

  expect(accountItem("camille-r · PAT").getAttribute("aria-checked")).toBe("true");
  click(accountItem("camille-work · OAuth"));

  await expect.poll(() => button("Planche account: camille-work")).toBeDefined();
  expect(calls.auth_switch_account).toBe(1);
  expect(calls.auth_sign_out).toBeUndefined();
  expect(useUi.getState().selectedId).toBeNull();

  await accountMenu("camille-work");
  click(accountItem("camille-r · PAT"));

  await expect.poll(() => button("Planche account: camille-r")).toBeDefined();
  expect(calls.auth_switch_account).toBe(2);
  expect(calls.auth_set_token).toBeUndefined();
});

test("settings show authentication methods and can switch accounts", async () => {
  await open();
  click(button("Settings ⌘,"));

  expect(get('[role="dialog"]').textContent).toContain("Connected via PAT");
  click(button("camille-workOAuth"));

  await expect.poll(() => button("Planche account: camille-work")).toBeDefined();
  click(button("Settings ⌘,"));

  expect(get('[role="dialog"]').textContent).toContain("Connected via OAuth");
  expect(button("camille-rPAT")).toBeDefined();
  expect(calls.auth_sign_out).toBeUndefined();
});

test("adding a PAT account keeps the saved accounts and never signs out", async () => {
  await open();
  click(button("Settings ⌘,"));
  click(button("Add account…"));
  click(button("Use a personal access token"));
  fill(get<HTMLInputElement>("#token"), "ghp_added_mock");
  submit(get("#token"));

  await expect.poll(() => button("Planche account: camille-added")).toBeDefined();
  await accountMenu("camille-added");

  expect(accountItem("camille-r · PAT")).toBeDefined();
  expect(accountItem("camille-work · OAuth")).toBeDefined();
  expect(accountItem("camille-added · PAT").getAttribute("aria-checked")).toBe("true");
  expect(calls.auth_sign_out).toBeUndefined();
});

test("signing out removes only the active account", async () => {
  await open();
  click(button("Settings ⌘,"));
  click(button("Sign out"));

  await expect.poll(() => button("Planche account: camille-work")).toBeDefined();
  await accountMenu("camille-work");

  expect(document.querySelector('[role="menu"]')?.textContent).not.toContain("camille-r");
  expect(accountItem("camille-work · OAuth")).toBeDefined();
  expect(calls.auth_sign_out).toBe(1);
});

test("adding an OAuth account preserves the existing PAT account", async () => {
  await open();
  click(button("Settings ⌘,"));
  click(button("Add account…"));
  click(button("Sign in with GitHub"));

  await expect.poll(() => button("Planche account: camille-added")).toBeDefined();
  await accountMenu("camille-added");

  expect(accountItem("camille-r · PAT")).toBeDefined();
  expect(accountItem("camille-added · OAuth").getAttribute("aria-checked")).toBe("true");
  expect(calls.auth_sign_out).toBeUndefined();
});

test("cancelling an added account leaves the current account connected", async () => {
  await open();
  click(button("Settings ⌘,"));
  click(button("Add account…"));
  key("Escape", get('[role="dialog"]'));

  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
  expect(button("Planche account: camille-r")).toBeDefined();
  expect(calls.auth_sign_out).toBeUndefined();
  expect(calls.auth_set_token).toBeUndefined();
});
