// @vitest-environment happy-dom
import { flushSync } from "react-dom";
import { expect, test, vi } from "vitest";
import { button, fill, get, key, render } from "@/test-support";
import { RepositoryShortcut } from "./repository-shortcut";

test("inline rename cancels with Escape and submits once when Enter also removes focus", async () => {
  const rename = vi.fn(async () => true);
  render(
    <RepositoryShortcut
      name="Filtre 1"
      onOpen={() => {}}
      onRename={rename}
      onDuplicate={() => {}}
      onRemove={() => {}}
    />,
  );
  const begin = () =>
    flushSync(() =>
      button("Filtre 1").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
  begin();
  const input = get<HTMLInputElement>('input[aria-label="Rename filter Filtre 1"]');
  await expect.poll(() => document.activeElement).toBe(input);
  fill(input, "Cancelled");

  key("Escape", input);

  expect(rename).not.toHaveBeenCalled();
  expect(document.querySelector("input")).toBeNull();
  begin();
  const editor = get<HTMLInputElement>('input[aria-label="Rename filter Filtre 1"]');
  await expect.poll(() => document.activeElement).toBe(editor);
  fill(editor, "Triage");
  key("Enter", editor);

  await expect.poll(() => document.querySelector("input")).toBeNull();
  expect(rename).toHaveBeenCalledExactlyOnceWith("Triage");
});

test("a refused rename keeps the editor and can be retried", async () => {
  const rename = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(
    <RepositoryShortcut
      name="Filtre 1"
      onOpen={() => {}}
      onRename={rename}
      onDuplicate={() => {}}
      onRemove={() => {}}
    />,
  );
  flushSync(() => button("Filtre 1").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  const input = get<HTMLInputElement>('input[aria-label="Rename filter Filtre 1"]');
  await expect.poll(() => document.activeElement).toBe(input);
  fill(input, "Taken");

  key("Enter", input);
  await expect.poll(() => rename.mock.calls.length).toBe(1);

  expect(get('input[aria-label="Rename filter Filtre 1"]')).toBe(input);
  fill(input, "Available");
  key("Enter", input);
  await expect.poll(() => document.querySelector("input")).toBeNull();
  expect(rename.mock.calls).toEqual([["Taken"], ["Available"]]);
});
