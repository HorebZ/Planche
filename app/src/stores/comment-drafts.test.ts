import { beforeEach, expect, test } from "vitest";
import { commentKey, useCommentDrafts } from "./comment-drafts";

beforeEach(() => useCommentDrafts.setState(useCommentDrafts.getInitialState()));

test("a double send is blocked and an unconfirmed receipt reuses its request ID", () => {
  const key = commentKey("A", "I_1");
  useCommentDrafts.getState().edit(key, "Saved text");

  const first = useCommentDrafts.getState().begin(key);

  expect(first).not.toBeNull();
  expect(useCommentDrafts.getState().begin(key)).toBeNull();
  if (!first) {
    throw new Error("missing ticket");
  }
  useCommentDrafts.getState().finish(first, false, "Receipt lost");
  const retry = useCommentDrafts.getState().begin(key);

  expect(retry?.request).toBe(first.request);
  expect(useCommentDrafts.getState().entries[key].body).toBe("Saved text");
  useCommentDrafts.getState().finish(first, true);

  expect(useCommentDrafts.getState().entries[key].body).toBe("");
});

test("late acceptance cannot clear a newer edit or another account's draft", () => {
  const key = commentKey("A", "I_1");
  const other = commentKey("B", "I_1");
  useCommentDrafts.getState().edit(key, "First version");
  const ticket = useCommentDrafts.getState().begin(key);
  if (!ticket) {
    throw new Error("missing ticket");
  }
  useCommentDrafts.getState().finish(ticket, false, "Receipt lost");
  useCommentDrafts.getState().edit(key, "New version");
  useCommentDrafts.getState().edit(other, "Private to account B");

  useCommentDrafts.getState().finish(ticket, true);

  expect(useCommentDrafts.getState().entries[key].body).toBe("New version");
  expect(useCommentDrafts.getState().entries[other].body).toBe("Private to account B");
  expect(useCommentDrafts.getState().begin(key)?.request).not.toBe(ticket.request);
});
