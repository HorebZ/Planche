// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { currentProjectQuery } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import {
  button,
  calls,
  click,
  fill,
  get,
  installMockBackend,
  render,
  submit,
} from "@/test-support";
import { Onboarding } from "./Onboarding";

test("GitHub sign-in displays the code and continues after authorization", async () => {
  installMockBackend("onboarding");
  render(<Onboarding signedIn={false} />);

  click(button("Sign in with GitHub"));

  await expect.poll(() => document.querySelector("output")?.textContent).toBe("ABCD-EFGH");
  await expect.poll(() => calls.auth_oauth_copy_code).toBe(1);
  await expect.poll(() => calls["plugin:opener|open_url"]).toBe(1);
  expect(document.querySelector('button[type="submit"]')).toBeNull();
  expect(document.body.textContent).not.toContain("Use a personal access token");
  expect(calls.auth_oauth_start).toBe(1);
  expect(calls.list_projects).toBeUndefined();

  await expect
    .poll(() => document.querySelector('[data-slot="account-block"]')?.textContent)
    .toContain("camille-r");

  expect(calls.auth_oauth_poll).toBe(1);
  expect(calls.auth_set_token).toBeUndefined();
  expect(button("Continue↵").disabled).toBe(false);

  click(button("Continue↵"));

  await expect.poll(() => document.body.textContent).toContain("Pick a project");
});

test("cancelling GitHub sign-in stops polling and permits a new attempt", async () => {
  installMockBackend("oauth-waiting");
  render(<Onboarding signedIn={false} />);
  click(button("Sign in with GitHub"));

  await expect.poll(() => document.querySelector("output")?.textContent).toBe("ABCD-EFGH");
  click(button("Cancel sign-in"));

  expect(document.querySelector("output")).toBeNull();
  await expect.poll(() => calls.auth_oauth_cancel).toBe(1);
  expect(calls.auth_oauth_poll).toBeUndefined();
  click(button("Sign in with GitHub"));

  await expect.poll(() => calls.auth_oauth_start).toBe(2);
});

test("a declined GitHub authorization is announced and can be retried", async () => {
  installMockBackend("oauth-denied");
  render(<Onboarding signedIn={false} />);
  click(button("Sign in with GitHub"));

  await expect
    .poll(() => document.querySelector('[role="alert"]')?.textContent)
    .toContain("authorization was declined");

  expect(document.querySelector('button[type="submit"]')).toBeNull();
  expect(button("Sign in with GitHub").disabled).toBe(false);
  expect(calls.auth_set_token).toBeUndefined();
});

test("the verification code can be copied again while waiting", async () => {
  installMockBackend("oauth-waiting");
  render(<Onboarding signedIn={false} />);
  click(button("Sign in with GitHub"));

  await expect.poll(() => calls.auth_oauth_copy_code).toBe(1);
  await expect.poll(() => document.body.textContent).toContain("Code copied");
  click(button("Copy code"));

  await expect.poll(() => calls.auth_oauth_copy_code).toBe(2);
  expect(calls.auth_oauth_start).toBe(1);
});

test("clipboard failure leaves the code available to copy manually", async () => {
  installMockBackend("oauth-copy-error");
  render(<Onboarding signedIn={false} />);
  click(button("Sign in with GitHub"));

  await expect
    .poll(() => document.querySelector('[role="alert"]')?.textContent)
    .toContain("Select and copy it manually");

  expect(get("output").textContent).toBe("ABCD-EFGH");
  expect(document.body.textContent).not.toContain("Code copied");
  expect(calls["plugin:opener|open_url"]).toBe(1);
});

test("the token field starts empty, masked and focused, with the required scopes", () => {
  installMockBackend("onboarding");
  render(<Onboarding signedIn={false} />);
  click(button("Use a personal access token"));

  const input = get<HTMLInputElement>("#token");

  expect(input.value).toBe("");
  expect(input.type).toBe("password");
  expect(document.activeElement).toBe(input);
  expect(button("Continue↵").disabled).toBe(true);
  expect(
    [...document.querySelectorAll('[data-slot="scope-row"]')].map((row) => row.textContent),
  ).toEqual([
    expect.stringContaining("repo"),
    expect.stringContaining("read:org"),
    expect.stringContaining("project"),
  ]);
});

test("validation disables resubmission, announces success and opens the selected project", async () => {
  installMockBackend("valid");
  const { client } = render(<Onboarding signedIn={false} />);
  click(button("Use a personal access token"));
  const input = get<HTMLInputElement>("#token");

  fill(input, "  ghp_example  ");
  submit(input);
  submit(input);

  expect(button("Continue↵").disabled).toBe(true);
  expect(input.readOnly).toBe(true);
  expect(get('[role="status"]').textContent).toContain("Checking…");
  expect(calls.auth_set_token).toBe(1);

  await expect.poll(() => get('[role="status"]').textContent).toContain("Valid");
  await expect
    .poll(() => get('[data-slot="account-block"]').textContent)
    .toContain("5 projects found");
  expect(document.activeElement).toBe(button("Continue↵"));

  click(button("Continue↵"));
  click(button("Planche — v1.21"));
  click(button("Open board↵"));

  await expect.poll(() => useUi.getState().projectId).toBe("PVT_planche");
  expect(client.getQueryData(currentProjectQuery.queryKey)).toBe("PVT_planche");
  expect(calls.open_project).toBe(1);
});

test("a rejected token has an accessible error which clears on edit", async () => {
  installMockBackend("invalid");
  render(<Onboarding signedIn={false} />);
  click(button("Use a personal access token"));
  const input = get<HTMLInputElement>("#token");

  fill(input, "ghp_wrong");
  submit(input);

  await expect.poll(() => input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe("token-error");
  expect(get("#token-error").getAttribute("role")).toBe("alert");
  expect(get("#token-error").textContent).toBe("token rejected by GitHub (401)");
  expect(document.activeElement).toBe(input);

  fill(input, "ghp_valid");

  expect(input.getAttribute("aria-invalid")).not.toBe("true");
  expect(document.querySelector("#token-error")).toBeNull();

  submit(input);

  await expect.poll(() => get('[role="status"]').textContent).toContain("Valid");
});

test.each([
  ["projects-empty", "empty", "No open projects found"],
  ["projects-error", "error", "Could not load projects"],
  ["projects-sso", "sso", "Organization access needs SSO"],
] as const)("%s can recover without revalidating the token", async (scenario, state, title) => {
  const backend = installMockBackend(scenario);
  render(<Onboarding signedIn />);

  await expect
    .poll(() => document.querySelector(`[data-state="${state}"]`)?.textContent)
    .toContain(title);
  expect(button("Open board↵").disabled).toBe(true);

  const notice = get(`[data-slot="project-access-state"][data-state="${state}"]`);

  if (state === "error") {
    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.textContent).toContain("Projects are inaccessible (403)");
  }

  if (state === "sso") {
    expect(notice.textContent).toContain("acme-sso");
    expect(button("Open organization SSO", notice).disabled).toBe(false);
  }

  backend.restoreProjects();
  click(button("Retry now", notice));

  await expect.poll(() => document.querySelector('[data-slot="project-access-state"]')).toBeNull();
  click(button("Planche — v1.21"));

  expect(button("Open board↵").disabled).toBe(false);
  expect(calls.auth_set_token).toBeUndefined();
});

test("a project-list failure preserves a validated token and Back starts fresh", async () => {
  const backend = installMockBackend("valid-projects-error");
  render(<Onboarding signedIn={false} />);
  click(button("Use a personal access token"));
  const input = get<HTMLInputElement>("#token");

  fill(input, "ghp_valid");
  submit(input);

  await expect.poll(() => get('[role="status"]').textContent).toContain("Valid");
  click(button("Continue↵"));

  await expect
    .poll(() => document.querySelector('[data-state="error"]')?.textContent)
    .toContain("Could not load projects");
  expect(calls.auth_set_token).toBe(1);

  backend.restoreProjects();
  click(button("Retry now"));

  await expect.poll(() => document.querySelector('[data-slot="project-access-state"]')).toBeNull();
  click(button("Back"));

  click(button("Use a personal access token"));

  expect(get<HTMLInputElement>("#token").value).toBe("");
  expect(document.activeElement).toBe(get("#token"));
  expect(calls.auth_set_token).toBe(1);
});

test("SSO guidance leaves projects from other owners selectable", async () => {
  installMockBackend("projects-partial-sso");
  render(<Onboarding signedIn />);

  await expect
    .poll(() => document.querySelector('[data-state="sso"]')?.textContent)
    .toContain("Organization access needs SSO");
  click(button("Planche — v1.21"));

  expect(button("Open board↵").disabled).toBe(false);
  expect(document.querySelector('[data-state="empty"]')).toBeNull();
});

test("a pending token check cannot list projects or open the board", () => {
  installMockBackend("checking");
  render(<Onboarding signedIn={false} />);
  click(button("Use a personal access token"));

  fill(get("#token"), "ghp_example");
  submit(get("#token"));

  expect(document.querySelectorAll('[data-slot="scope-row"][data-state="checking"]')).toHaveLength(
    3,
  );
  expect(calls.list_projects).toBeUndefined();
  expect(calls.open_project).toBeUndefined();
});
