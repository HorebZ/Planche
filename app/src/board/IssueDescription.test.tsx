// @vitest-environment happy-dom
import { mockIPC } from "@tauri-apps/api/mocks";
import { useState } from "react";
import { expect, test } from "vitest";
import { IssueDescriptionContent } from "@/components/ui/issue-description";
import { issueDescription } from "@/ipc/_fixtures/description.fixtures";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import type { IssueDescription as Description } from "@/ipc/bindings.types";
import {
  authQuery,
  cachedDescriptionQuery,
  createQueryClient,
  descriptionQuery,
} from "@/ipc/queries";
import { button, click, get, render } from "@/test-support";
import { IssueDescription } from "./IssueDescription";

test("cached content displays offline without attempting a network request", async () => {
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);

    return issueDescription({ body: "Saved body" });
  });

  render(
    <IssueDescription
      account="A"
      content="issue"
      offline
    />,
  );

  await expect.poll(() => document.body.textContent).toContain("Saved body");
  expect(document.body.textContent).toContain("Saved description · Offline");
  expect(commands).toEqual(["cached_issue_description"]);
});

test("network failure retains saved content, access denial removes it and Retry can restore access", async () => {
  let attempt = 0;
  const client = createQueryClient();
  mockIPC((command) => {
    if (command === "cached_issue_description") {
      return issueDescription({ body: "Private saved body" });
    }

    if (++attempt === 1) {
      throw { kind: "Network", message: "Offline" };
    }

    return attempt === 2 ? null : issueDescription({ body: "Access restored" });
  });

  render(
    <IssueDescription
      account="A"
      content="issue"
      offline={false}
    />,
    client,
  );

  await expect.poll(() => document.body.textContent).toContain("Saved description · Offline");
  expect(document.body.textContent).toContain("Private saved body");
  click(button("Retry description"));

  await expect.poll(() => document.body.textContent).toContain("Your access may have changed");
  expect(document.body.textContent).not.toContain("Private saved body");
  expect(client.getQueryData(cachedDescriptionQuery("A", "issue").queryKey)).toBeNull();
  click(button("Retry description"));

  await expect.poll(() => document.body.textContent).toContain("Access restored");
});

test("each opening revalidates even when the description is already in TanStack Query", async () => {
  let requests = 0;
  mockIPC((command) =>
    command === "cached_issue_description"
      ? null
      : issueDescription({ body: `Revision ${++requests}` }),
  );
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
        {open ? (
          <IssueDescription
            account="A"
            content="issue"
            offline={false}
          />
        ) : null}
      </>
    );
  }

  render(<OpenClose />);

  await expect.poll(() => document.body.textContent).toContain("Revision 1");
  click(button("Toggle"));
  click(button("Toggle"));

  await expect.poll(() => document.body.textContent).toContain("Revision 2");
  expect(requests).toBe(2);
});

test("switching issues ignores an earlier pending response", async () => {
  let finish: (description: Description) => void = () => {};
  const waiting = new Promise<Description>((resolve) => {
    finish = resolve;
  });
  mockIPC((command, args) =>
    command === "cached_issue_description"
      ? null
      : args && "content" in args && args.content === "first"
        ? waiting
        : issueDescription({ body: "Second issue" }),
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
        <IssueDescription
          account="A"
          content={content}
          offline={false}
        />
      </>
    );
  }

  render(<SwitchIssue />);

  await expect.poll(() => document.body.textContent).toContain("Loading description");
  click(button("Next"));

  await expect.poll(() => document.body.textContent).toContain("Second issue");
  finish(issueDescription({ body: "Late first issue" }));
  await Promise.resolve();

  expect(document.body.textContent).not.toContain("Late first issue");
});

test("an account change clears descriptions and rejects an old IPC response", async () => {
  const client = createQueryClient();
  client.setQueryData(authQuery.queryKey, authStatus({ id: "A" }));
  let finish: (description: Description) => void = () => {};
  const waiting = new Promise<Description>((resolve) => {
    finish = resolve;
  });
  mockIPC(() => waiting);
  const request = client.fetchQuery(descriptionQuery("A", "issue")).catch(() => null);

  client.setQueryData(authQuery.queryKey, authStatus({ id: "B" }));
  finish(issueDescription({ body: "Old account body" }));
  await request;

  expect(client.getQueriesData({ queryKey: ["issue-description"] })).toEqual([]);
  client.clear();
});

test("description Markdown never renders raw HTML or loads remote images", () => {
  const body = "<script>alert(1)</script>\n![tracking](https://example.com/pixel.png)";

  render(
    <IssueDescriptionContent
      status="ready"
      body={body}
      onRetry={() => {}}
      onOpenLink={() => {}}
    />,
  );

  expect(get('[aria-label="Description"]').textContent).toContain("Image not loaded: tracking");
  expect(document.querySelector("script, img, a")).toBeNull();
});
