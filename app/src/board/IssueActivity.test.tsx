// @vitest-environment happy-dom
import { mockIPC } from "@tauri-apps/api/mocks";
import { useState } from "react";
import { expect, test } from "vitest";
import { IssueActivityContent } from "@/components/ui/issue-activity";
import { issueActivity } from "@/ipc/_fixtures/activity.fixtures";
import { issueDescription } from "@/ipc/_fixtures/description.fixtures";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import type { IssueActivity as Activity } from "@/ipc/bindings.types";
import {
  activityQuery,
  authQuery,
  cachedActivityQuery,
  cachedDescriptionQuery,
  createQueryClient,
  descriptionQuery,
  issueQuery,
} from "@/ipc/queries";
import { button, click, get, render } from "@/test-support";
import { IssueActivity } from "./IssueActivity";

const props = {
  account: "A",
  content: "issue",
  offline: false,
  sourceUrl: "https://github.com/o/r/issues/1",
};

test("offline activity shows its timestamp without making a network request", async () => {
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    return issueActivity();
  });

  render(
    <IssueActivity
      {...props}
      offline
    />,
  );

  await expect.poll(() => document.body.textContent).toContain("Saved activity · Offline");
  expect(document.body.textContent).toContain("Ready for review");
  expect(get<HTMLTimeElement>("time").dateTime).toBe("2026-11-03T12:00:00Z");
  expect(commands).toEqual(["cached_issue_activity"]);
});

test("a failed refresh keeps saved activity; access denial removes all protected content and retry restores it", async () => {
  let attempt = 0;
  const client = createQueryClient();
  client.setQueryData(cachedDescriptionQuery("A", "issue").queryKey, issueDescription());
  mockIPC((command) => {
    if (command === "cached_issue_activity") {
      return issueActivity();
    }
    if (++attempt === 1) {
      throw { kind: "Network", message: "Offline" };
    }
    return attempt === 2 ? null : issueActivity({ entries: [], pull_requests: [] });
  });

  render(<IssueActivity {...props} />, client);

  await expect.poll(() => document.body.textContent).toContain("Saved activity · Offline");
  expect(document.body.textContent).toContain("Ready for review");
  click(button("Retry activity"));

  await expect.poll(() => document.body.textContent).toContain("Your access may have changed");
  expect(document.body.textContent).not.toContain("Ready for review");
  expect(client.getQueryData(cachedActivityQuery("A", "issue").queryKey)).toBeNull();
  expect(client.getQueryData(cachedDescriptionQuery("A", "issue").queryKey)).toBeNull();
  click(button("Retry activity"));

  await expect.poll(() => document.body.textContent).toContain("No activity yet.");
  expect(document.body.textContent).toContain("No closing pull requests.");
});

test("an API error shows Retry and retains the dated cache", async () => {
  mockIPC((command) => {
    if (command === "cached_issue_activity") {
      return issueActivity();
    }
    throw { kind: "GitHub", message: "Server failure" };
  });

  render(<IssueActivity {...props} />);

  await expect
    .poll(() => document.querySelector('[role="alert"]')?.textContent)
    .toContain("Server failure");
  expect(document.body.textContent).toContain("Ready for review");
  expect(button("Retry activity").disabled).toBe(false);
});

test("changing issue cannot show a late response from the previous issue", async () => {
  let finish: (activity: Activity) => void = () => {};
  const waiting = new Promise<Activity>((resolve) => {
    finish = resolve;
  });
  mockIPC((command, args) =>
    command === "cached_issue_activity"
      ? null
      : args && "content" in args && args.content === "first"
        ? waiting
        : issueActivity({ entries: [], pull_requests: [] }),
  );
  function SwitchIssue() {
    const [content, setContent] = useState("first");
    return (
      <>
        <button
          type="button"
          onClick={() => setContent("second")}
        >
          Next
        </button>
        <IssueActivity
          {...props}
          content={content}
        />
      </>
    );
  }

  render(<SwitchIssue />);

  await expect.poll(() => document.body.textContent).toContain("Loading activity");
  click(button("Next"));
  await expect.poll(() => document.body.textContent).toContain("No activity yet.");
  finish(issueActivity());
  await Promise.resolve();

  expect(document.body.textContent).not.toContain("Ready for review");
});

test("account changes discard cached activity and a pending IPC response", async () => {
  const client = createQueryClient();
  client.setQueryData(authQuery.queryKey, authStatus({ id: "A" }));
  client.setQueryData(cachedActivityQuery("A", "issue").queryKey, issueActivity());
  let finish: (activity: Activity) => void = () => {};
  const waiting = new Promise<Activity>((resolve) => {
    finish = resolve;
  });
  mockIPC(() => waiting);
  const request = client.fetchQuery(activityQuery("A", "issue")).catch(() => null);

  client.setQueryData(authQuery.queryKey, authStatus({ id: "B" }));
  finish(issueActivity());
  await request;

  expect(client.getQueriesData({ queryKey: ["issue-activity"] })).toEqual([]);
  client.clear();
});

test("refusals from description or issue cancel a late activity response", async () => {
  for (const source of ["description", "issue"]) {
    const client = createQueryClient();
    client.setQueryData(cachedActivityQuery("A", "issue").queryKey, issueActivity());
    let finish: (activity: Activity) => void = () => {};
    const waiting = new Promise<Activity>((resolve) => {
      finish = resolve;
    });
    mockIPC((command) =>
      command === "refresh_issue_activity"
        ? waiting
        : source === "issue"
          ? { status: "unavailable" }
          : null,
    );
    const request = client.fetchQuery(activityQuery("A", "issue")).catch(() => null);

    if (source === "description") {
      await client.fetchQuery(descriptionQuery("A", "issue"));
    } else {
      await client.fetchQuery(issueQuery("A", "issue"));
    }
    finish(issueActivity());
    await request;

    expect(client.getQueryData(cachedActivityQuery("A", "issue").queryKey)).toBeNull();
    expect(client.getQueryData(activityQuery("A", "issue").queryKey)).toBeNull();
    client.clear();
  }
});

test("activity revalidates on every opening", async () => {
  let requests = 0;
  mockIPC((command) => {
    if (command === "cached_issue_activity") {
      return null;
    }
    requests++;
    return issueActivity();
  });
  function OpenClose() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(!open)}
        >
          Toggle
        </button>
        {open ? <IssueActivity {...props} /> : null}
      </>
    );
  }

  render(<OpenClose />);

  await expect.poll(() => requests).toBe(1);
  click(button("Toggle"));
  click(button("Toggle"));

  await expect.poll(() => requests).toBe(2);
});

test("comments use safe Markdown and missing text/authors and all PR states have readable fallbacks", () => {
  const activity = issueActivity();
  activity.entries[0] = {
    ...activity.entries[0],
    author: null,
    body: "<script>alert(1)</script>\n![tracking](https://example.com/pixel.png)",
  };
  activity.entries.push({ ...activity.entries[0], id: "missing", body: null });
  activity.pull_requests = ["open", "closed", "merged"].map((state, index) => ({
    ...activity.pull_requests[0],
    id: `pr-${index}`,
    state: state as "open" | "closed" | "merged",
  }));

  render(
    <IssueActivityContent
      status="ready"
      activity={activity}
      onRetry={() => {}}
      onOpenLink={() => {}}
    />,
  );

  expect(document.body.textContent).toContain("Deleted user");
  expect(document.body.textContent).toContain("Comment text unavailable.");
  expect(document.body.textContent).toContain("Image not loaded: tracking");
  expect(document.querySelector("script, img")).toBeNull();
  for (const state of ["Open", "Closed", "Merged"]) {
    expect(document.body.textContent).toContain(state);
  }
});
