import { beforeEach, expect, test } from "vitest";
import { draftKey, useDrafts } from "./drafts";

const key = draftKey("U", "P", null);

beforeEach(() => useDrafts.setState({ entries: {} }));

test("session drafts are isolated by account, project and nullable column", () => {
  const s = useDrafts.getState();

  for (const k of [
    key,
    draftKey("V", "P", null),
    draftKey("U", "Q", null),
    draftKey("U", "P", "null"),
  ]) {
    s.edit(k, k);
  }

  expect(Object.keys(useDrafts.getState().entries)).toHaveLength(4);
  expect(useDrafts.getState().entries[key].title).toBe(key);
});
test("double submission and remount remain locked until a receipt", () => {
  const s = useDrafts.getState();

  s.edit(key, " Draft ");

  const ticket = s.begin(key, "first");

  if (!ticket) {
    throw new Error("missing ticket");
  }

  expect(ticket.title).toBe("Draft");
  expect(s.begin(key, "second")).toBeNull();

  s.finish(ticket, { type: "unknown", message: "timeout" });

  expect(s.begin(key, "second")).toBeNull();
  expect(s.finish(ticket, { type: "accepted", seq: 1 })).toBe(true);
  expect(useDrafts.getState().entries[key].title).toBe("");
});
test.each(["accepted", "rejected"] as const)(
  "late %s preserves newer text and ignores obsolete tickets",
  (type) => {
    const s = useDrafts.getState();

    s.edit(key, "Old");

    const ticket = s.begin(key, "first");

    if (!ticket) {
      throw new Error("missing ticket");
    }

    s.edit(key, "New");
    s.finish(ticket, { type: "unknown", message: "timeout" });

    expect(
      s.finish(
        ticket,
        type === "accepted"
          ? { type, seq: 1 }
          : { type, error: { kind: "Cache", message: "disk full" } },
      ),
    ).toBe(false);
    expect(useDrafts.getState().entries[key].title).toBe("New");

    const next = s.begin(key, "second");

    expect(next).not.toBeNull();
    expect(s.finish(ticket, { type: "accepted", seq: 1 })).toBe(false);
    expect(useDrafts.getState().entries[key].ticket).toBe(next);
  },
);
