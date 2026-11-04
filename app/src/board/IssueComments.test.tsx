// @vitest-environment happy-dom
import { mockIPC } from "@tauri-apps/api/mocks";
import { useState } from "react";
import { expect, test } from "vitest";
import { commentSubmission } from "@/ipc/_fixtures/comment.fixtures";
import { issueRecord } from "@/ipc/_fixtures/issue.fixtures";
import type { CommentSubmission, DispatchOutcome } from "@/ipc/bindings.types";
import { button, click, fill, get, key, render } from "@/test-support";
import { IssueComments } from "./IssueComments";

const props = {
  account: "A",
  content: "I_1",
  offline: false,
  sourceUrl: "https://github.com/o/r/issues/1",
  onOpenLink: () => {},
};
const field = () => get<HTMLTextAreaElement>("textarea");

test("unsent text survives closing, changing issues, and account navigation without crossing accounts", async () => {
  mockIPC((command) =>
    command === "cached_issue_comments"
      ? []
      : command === "refresh_issue"
        ? { status: "ready", issue: issueRecord() }
        : issueRecord(),
  );
  function Navigate() {
    const [content, setContent] = useState("I_1");
    const [account, setAccount] = useState("A");
    const [open, setOpen] = useState(true);
    return (
      <>
        <button
          type="button"
          onClick={() => setContent(content === "I_1" ? "I_2" : "I_1")}
        >
          Next issue
        </button>
        <button
          type="button"
          onClick={() => setAccount(account === "A" ? "B" : "A")}
        >
          Switch account
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
        >
          Toggle
        </button>
        {open ? (
          <IssueComments
            {...props}
            key={`${account}:${content}`}
            account={account}
            content={content}
          />
        ) : null}
      </>
    );
  }

  render(<Navigate />);
  await expect.poll(() => field().disabled).toBe(false);
  fill(field(), "My **draft**");
  click(button("Next issue"));
  expect(field().value).toBe("");
  click(button("Next issue"));
  expect(field().value).toBe("My **draft**");
  click(button("Switch account"));
  expect(field().value).toBe("");
  click(button("Switch account"));
  expect(field().value).toBe("My **draft**");
  click(button("Toggle"));
  click(button("Toggle"));
  expect(field().value).toBe("My **draft**");
});

test("Cmd+Enter submits once, retains text on refusal, and clears it only after a durable receipt", async () => {
  const sent: unknown[] = [];
  let finish: (outcome: DispatchOutcome) => void = () => {};
  let comments: CommentSubmission[] = [];
  mockIPC((command, args) => {
    if (command === "cached_issue_comments") {
      return comments;
    }
    if (command === "refresh_issue") {
      return { status: "ready", issue: issueRecord() };
    }
    if (command === "dispatch_issue_intent") {
      sent.push(args);
      return new Promise<DispatchOutcome>((resolve) => {
        finish = resolve;
      });
    }
    return issueRecord();
  });
  render(<IssueComments {...props} />);
  await expect.poll(() => field().disabled).toBe(false);
  expect(get<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
  fill(field(), "   ");
  expect(get<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
  fill(field(), "Do not lose my text");
  key("Enter", field(), { metaKey: true });
  key("Enter", field(), { metaKey: true });

  expect(sent).toHaveLength(1);
  expect(field().value).toBe("Do not lose my text");
  finish({ type: "rejected", error: { kind: "Cache", message: "Disk full" } });
  await expect.poll(() => document.body.textContent).toContain("Disk full");
  expect(field().value).toBe("Do not lose my text");
  key("Enter", field(), { metaKey: true });
  comments = [commentSubmission({ body: "Do not lose my text" })];
  finish({ type: "accepted", seq: 1 });

  await expect.poll(() => field().value).toBe("");
  await expect.poll(() => document.body.textContent).toContain("Comment queued");
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
});

test("failed text remains visible and retry uses the saved request rather than a new comment", async () => {
  const saved = commentSubmission({
    status: "failed",
    error: "Publication could not be confirmed. Check GitHub before retrying.",
  });
  let request: unknown;
  mockIPC((command, args) => {
    if (command === "cached_issue_comments") {
      return [saved];
    }
    if (command === "refresh_issue") {
      return { status: "ready", issue: issueRecord() };
    }
    if (command === "dispatch_issue_intent") {
      request = args;
      return { type: "accepted", seq: 1 };
    }
    return issueRecord();
  });
  render(<IssueComments {...props} />);
  await expect.poll(() => document.body.textContent).toContain("Ready for review");
  await expect.poll(() => button("Retry comment").disabled).toBe(false);

  click(button("Retry comment"));

  expect(request).toEqual({
    account: "A",
    intent: {
      type: "add_comment",
      content_id: "I_1",
      request_id: saved.request_id,
      body: saved.body,
    },
  });
});

test("locked conversations cannot send comments", async () => {
  const issue = issueRecord();
  if (issue.permissions) {
    issue.permissions.comment = false;
  }
  const calls: string[] = [];
  mockIPC((command) => {
    calls.push(command);
    return command === "cached_issue_comments"
      ? []
      : command === "refresh_issue"
        ? { status: "ready", issue }
        : issue;
  });
  render(<IssueComments {...props} />);

  await expect.poll(() => document.body.textContent).toContain("conversation is locked");
  expect(field().disabled).toBe(true);
  key("Enter", field(), { metaKey: true });
  expect(calls).not.toContain("dispatch_issue_intent");
});
