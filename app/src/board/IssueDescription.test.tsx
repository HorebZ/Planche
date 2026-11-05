// @vitest-environment happy-dom
import { mockIPC } from "@tauri-apps/api/mocks";
import { useState } from "react";
import { expect, test } from "vitest";
import { IssueDescriptionContent } from "@/components/ui/issue-description";
import { issueDescription } from "@/ipc/_fixtures/description.fixtures";
import { issueRecord } from "@/ipc/_fixtures/issue.fixtures";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import type { IssueDescription as Description } from "@/ipc/bindings.types";
import {
  authQuery,
  cachedDescriptionQuery,
  createQueryClient,
  descriptionQuery,
} from "@/ipc/queries";
import { button, click, fill, get, render } from "@/test-support";
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
  expect(commands).toEqual(["cached_issue_description", "cached_issue"]);
});

test("network failure retains saved content, access denial removes it and Retry can restore access", async () => {
  let attempt = 0;
  const client = createQueryClient();
  mockIPC((command) => {
    if (command === "cached_issue") {
      return null;
    }

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
    command === "cached_issue_description" || command === "cached_issue"
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
    command === "cached_issue_description" || command === "cached_issue"
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

test("editing previews Markdown, cancels without writing, and saves the exact body including an empty body", async () => {
  let saved = issueDescription({ body: "Original **description**" });
  const writes: unknown[] = [];
  mockIPC((command, args) => {
    if (command === "cached_issue") {
      return issueRecord();
    }
    if (command === "dispatch_issue_intent") {
      writes.push(args);
      saved = issueDescription({
        body: (args as { intent: { body: string } }).intent.body,
        pending: true,
      });
      return { type: "accepted", seq: writes.length };
    }

    return saved;
  });
  render(
    <IssueDescription
      account="A"
      content="issue"
      offline={false}
    />,
  );

  await expect.poll(() => document.body.textContent).toContain("Edit description");
  click(button("Edit description"));
  const editor = get<HTMLTextAreaElement>("textarea");
  expect(editor.value).toBe("Original **description**");
  fill(editor, "# Preview\n\n**Formatted**  \n");
  click(button("Preview"));

  expect(get('section[aria-label="Edit description"] strong').textContent).toBe("Formatted");
  expect(document.querySelector("textarea")).toBeNull();
  click(button("Write"));

  expect(get<HTMLTextAreaElement>("textarea").value).toBe("# Preview\n\n**Formatted**  \n");
  click(button("Cancel"));

  expect(writes).toEqual([]);
  expect(document.body.textContent).toContain("Original description");
  click(button("Edit description"));
  const body = "# Updated\n\n**Exact**  \n\n```rust\nlet ready = true;\n```\n";
  fill(get<HTMLTextAreaElement>("textarea"), body);
  click(button("Save description"));

  await expect.poll(() => document.body.textContent).toContain("Waiting for GitHub sync");
  expect(writes).toEqual([
    { account: "A", intent: { type: "update_body", content_id: "issue", body } },
  ]);
  expect(button("Edit description").disabled).toBe(true);
});

test("an offline edit can clear the description and only reads the local cache after saving", async () => {
  let saved = issueDescription();
  const commands: string[] = [];
  mockIPC((command, args) => {
    commands.push(command);
    if (command === "cached_issue") {
      return issueRecord();
    }
    if (command === "dispatch_issue_intent") {
      expect(args).toEqual({
        account: "A",
        intent: { type: "update_body", content_id: "issue", body: "" },
      });
      saved = issueDescription({ body: "", pending: true });
      return { type: "accepted", seq: 1 };
    }

    return saved;
  });
  render(
    <IssueDescription
      account="A"
      content="issue"
      offline
    />,
  );

  await expect.poll(() => document.body.textContent).toContain("Edit description");
  click(button("Edit description"));
  fill(get<HTMLTextAreaElement>("textarea"), "");
  click(button("Save description"));

  await expect.poll(() => document.body.textContent).toContain("No description provided.");
  expect(document.body.textContent).toContain("Waiting for GitHub sync");
  expect(commands).not.toContain("refresh_issue_description");
});

test("rejection and IPC errors keep the edited text available for retry", async () => {
  let attempts = 0;
  mockIPC((command) => {
    if (command === "cached_issue") {
      return issueRecord();
    }
    if (command === "dispatch_issue_intent") {
      if (++attempts === 1) {
        return { type: "rejected", error: { kind: "GitHub", message: "Editing refused" } };
      }

      throw { kind: "Network", message: "IPC failed" };
    }

    return issueDescription();
  });
  render(
    <IssueDescription
      account="A"
      content="issue"
      offline={false}
    />,
  );

  await expect.poll(() => document.body.textContent).toContain("Edit description");
  click(button("Edit description"));
  fill(get<HTMLTextAreaElement>("textarea"), "Keep my text");
  click(button("Save description"));

  await expect.poll(() => get('[role="alert"]').textContent).toBe("Editing refused");
  expect(get<HTMLTextAreaElement>("textarea").value).toBe("Keep my text");
  click(button("Save description"));

  await expect.poll(() => get('[role="alert"]').textContent).toBe("IPC failed");
  expect(get<HTMLTextAreaElement>("textarea").value).toBe("Keep my text");
});

test("project access alone does not expose description editing", async () => {
  const issue = issueRecord();
  if (issue.permissions) {
    issue.permissions.update = false;
  }
  mockIPC((command) => (command === "cached_issue" ? issue : issueDescription()));
  render(
    <IssueDescription
      account="A"
      content="issue"
      offline={false}
    />,
  );

  await expect.poll(() => document.body.textContent).toContain("Details loaded on demand.");
  expect(document.body.textContent).not.toContain("Edit description");
});

test("a refused GitHub update keeps its saved Markdown available for editing and retry", async () => {
  const saved = issueDescription({ body: "Keep **my edit**", error: "GitHub refused the update" });
  mockIPC((command) => (command === "cached_issue" ? issueRecord() : saved));
  render(
    <IssueDescription
      account="A"
      content="issue"
      offline={false}
    />,
  );

  await expect.poll(() => document.body.textContent).toContain("Edit to retry.");
  expect(document.body.textContent).toContain("Keep my edit");
  click(button("Edit description"));

  expect(get<HTMLTextAreaElement>("textarea").value).toBe("Keep **my edit**");
});

test("a late save receipt cannot repopulate description data after changing accounts", async () => {
  const client = createQueryClient();
  client.setQueryData(authQuery.queryKey, authStatus({ id: "A" }));
  let finish: (outcome: { type: "accepted"; seq: number }) => void = () => {};
  const receipt = new Promise((resolve) => {
    finish = resolve;
  });
  mockIPC((command, args) => {
    if (command === "cached_issue") {
      return issueRecord();
    }
    if (command === "dispatch_issue_intent") {
      return receipt;
    }

    return issueDescription({
      body:
        args && "account" in args && args.account === "B" ? "New account body" : "Private old body",
    });
  });
  function SwitchAccount() {
    const [account, setAccount] = useState("A");

    return (
      <>
        <button
          type="button"
          onClick={() => {
            client.setQueryData(authQuery.queryKey, authStatus({ id: "B" }));
            setAccount("B");
          }}
        >
          Switch account
        </button>
        <IssueDescription
          account={account}
          content="issue"
          offline={false}
        />
      </>
    );
  }
  render(<SwitchAccount />, client);

  await expect.poll(() => document.body.textContent).toContain("Edit description");
  click(button("Edit description"));
  fill(get<HTMLTextAreaElement>("textarea"), "Private old draft");
  click(button("Save description"));
  click(button("Switch account"));

  await expect.poll(() => document.body.textContent).toContain("New account body");
  finish({ type: "accepted", seq: 1 });
  await receipt;
  await Promise.resolve();

  expect(document.body.textContent).not.toContain("Private old");
  expect(client.getQueriesData({ queryKey: ["issue-description", "github.com", "A"] })).toEqual([]);
});
