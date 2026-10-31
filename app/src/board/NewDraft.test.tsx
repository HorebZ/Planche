// @vitest-environment happy-dom

import { flushSync } from "react-dom";
import { expect, test, vi } from "vitest";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import { authQuery, createQueryClient } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import { fill, get, key, render, submit } from "@/test-support";
import { type DraftSubmit, NewDraft } from "./NewDraft";
import type { DispatchResult } from "./useActions";

function editor(onSubmit: DraftSubmit) {
  const client = createQueryClient();

  client.setQueryData(authQuery.queryKey, authStatus({ id: "U", login: "user" }));

  function Session() {
    const overlay = useUi((state) => state.overlay);

    return overlay?.type === "draft" ? (
      <NewDraft
        key={overlay.editor}
        projectId="P"
        column="todo"
        onSubmit={onSubmit}
      />
    ) : null;
  }

  render(<Session />, client);

  const open = () => flushSync(() => useUi.getState().open({ type: "draft", column: "todo" }));

  open();

  return { open, input: () => get<HTMLInputElement>('[aria-label="Draft title"]') };
}

test("blur preserves session text across remounts, Escape discards it", () => {
  const onSubmit = vi.fn<DraftSubmit>();
  const { open, input } = editor(onSubmit);

  fill(input(), "Session title");
  flushSync(() => input().blur());

  expect(document.querySelector("input")).toBeNull();

  open();

  expect(input().value).toBe("Session title");
  expect(document.activeElement).toBe(input());

  key("Escape", input());
  open();

  expect(input().value).toBe("");
  expect(onSubmit).not.toHaveBeenCalled();
});

test("double Enter sends once and a late receipt preserves a new editor and text", () => {
  let observe: ((result: DispatchResult) => void) | undefined;
  const onSubmit = vi.fn<DraftSubmit>((_title, callback) => {
    observe = callback;

    return new Promise(() => {});
  });
  const { open, input } = editor(onSubmit);

  fill(input(), "  Submitted title  ");
  submit(input());
  submit(input());

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0][0]).toBe("Submitted title");
  expect(input().getAttribute("aria-busy")).toBe("true");

  flushSync(() => input().blur());
  open();
  fill(input(), "New text");
  submit(input());
  flushSync(() => observe?.({ type: "accepted", seq: 1 }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(input().value).toBe("New text");
  expect(document.activeElement).toBe(input());
  expect(input().getAttribute("aria-busy")).toBe("false");
});

test("a refusal preserves the title and allows an explicit retry", () => {
  let observe: ((result: DispatchResult) => void) | undefined;
  const onSubmit = vi.fn<DraftSubmit>((_title, callback) => {
    observe = callback;

    return new Promise(() => {});
  });
  const { input } = editor(onSubmit);

  fill(input(), "Keep after refusal");
  submit(input());
  flushSync(() => observe?.({ type: "rejected", error: { kind: "Cache", message: "disk full" } }));

  expect(input().value).toBe("Keep after refusal");
  expect(get('[role="status"]').textContent).toBe("disk full");

  submit(input());

  expect(onSubmit).toHaveBeenCalledTimes(2);

  flushSync(() => observe?.({ type: "accepted", seq: 1 }));

  expect(document.querySelector("input")).toBeNull();
});

test("an unconfirmed submission blocks retries until the late receipt", () => {
  let observe: ((result: DispatchResult) => void) | undefined;
  const onSubmit = vi.fn<DraftSubmit>((_title, callback) => {
    observe = callback;

    return new Promise(() => {});
  });
  const { input } = editor(onSubmit);

  fill(input(), "   ");
  submit(input());

  expect(onSubmit).not.toHaveBeenCalled();

  fill(input(), "Draft");
  submit(input());
  flushSync(() => observe?.({ type: "unknown", message: "Not confirmed" }));
  submit(input());

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(get('[role="status"]').textContent).toContain("Not confirmed");

  flushSync(() => observe?.({ type: "accepted", seq: 1 }));

  expect(document.querySelector("input")).toBeNull();
});
