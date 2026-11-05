// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { issueActivity } from "@/ipc/_fixtures/activity.fixtures";
import { click, get, render } from "@/test-support";
import { IssueResources } from "./issue-resources";

test("empty resources render no section", () => {
  render(<IssueResources onOpenLink={() => {}} />);

  expect(document.querySelector('[aria-label="Resources"]')).toBeNull();
});

test("dependencies alone show their direction and omit zero counts", () => {
  render(
    <IssueResources
      blockedBy={2}
      onOpenLink={() => {}}
    />,
  );

  expect(get("li").textContent).toBe("Blocked by 2 issues");
  expect(document.querySelectorAll("li")).toHaveLength(1);
});

test("blocking a single issue uses the singular", () => {
  render(
    <IssueResources
      blocking={1}
      onOpenLink={() => {}}
    />,
  );

  expect(get("li").textContent).toBe("Blocking 1 issue");
});

test("pull requests show their state icon and open through the provided handler", () => {
  const onOpenLink = vi.fn();
  const pullRequest = issueActivity().pull_requests[0];
  const pullRequests = [
    { ...pullRequest, id: "open", state: "open" as const },
    { ...pullRequest, id: "closed", state: "closed" as const },
    { ...pullRequest, id: "merged" },
    { ...pullRequest, id: "draft", state: "open" as const, is_draft: true },
  ];

  render(
    <IssueResources
      pullRequests={pullRequests}
      onOpenLink={onOpenLink}
    />,
  );
  click(get("a"));

  expect(onOpenLink).toHaveBeenCalledWith(pullRequest.url);
  expect(get<HTMLAnchorElement>("a").href).toBe(pullRequest.url);
  for (const state of ["Open", "Closed", "Merged", "Draft"]) {
    expect(document.querySelector(`[role="img"][aria-label="${state}"]`)).not.toBeNull();
  }
});
