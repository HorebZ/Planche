// @vitest-environment happy-dom
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { button, click, get, key, render } from "@/test-support";
import { IssueTabPanel, IssueTabs } from "./issue-tabs";

function Workspace() {
  const [active, setActive] = useState<string>("issue-1");

  return (
    <IssueTabs
      tabs={[
        { id: "source", title: "Project A", project: "Project A", kind: "board", closable: false },
        { id: "issue-1", title: "First issue", project: "Project A" },
        { id: "issue-2", title: "Second issue", project: "Project B" },
      ]}
      active={active}
      onSelect={setActive}
      onClose={() => setActive("source")}
      onAdd={() => {}}
    >
      <IssueTabPanel value="source">Source</IssueTabPanel>
      <IssueTabPanel value="issue-1">
        <textarea aria-label="Unsent comment" />
      </IssueTabPanel>
      <IssueTabPanel value="issue-2">Second issue content</IssueTabPanel>
    </IssueTabs>
  );
}

test("switching tabs and returning to the source keeps an unsent editor mounted", () => {
  render(<Workspace />);
  const editor = get<HTMLTextAreaElement>('[aria-label="Unsent comment"]');

  editor.value = "An unsent comment";
  key("Enter", button("Second issue"));

  expect(button("Second issue").getAttribute("aria-selected")).toBe("true");
  expect(get('[aria-label="Unsent comment"]')).toBe(editor);
  key("Enter", button("Project A"));
  key("Enter", button("First issue"));

  expect(button("First issue").getAttribute("aria-selected")).toBe("true");
  expect(get('[aria-label="Unsent comment"]')).toBe(editor);
  expect(editor.value).toBe("An unsent comment");
});

test("Backspace on an inactive tab's close button closes that tab", () => {
  const close = vi.fn();
  render(
    <IssueTabs
      tabs={[
        { id: "issue-1", title: "First issue", project: "Project" },
        { id: "issue-2", title: "Second issue", project: "Project" },
      ]}
      active="issue-1"
      onSelect={() => {}}
      onClose={close}
      onAdd={() => {}}
    >
      <IssueTabPanel value="source" />
      <IssueTabPanel value="issue-1" />
      <IssueTabPanel value="issue-2" />
    </IssueTabs>,
  );

  key("Backspace", button("Close tab: Second issue"));

  expect(close).toHaveBeenCalledExactlyOnceWith("issue-2");
});

test("the board tab and add button remain visible without issue tabs", () => {
  const add = vi.fn();
  const close = vi.fn();
  render(
    <IssueTabs
      tabs={[
        { id: "source", title: "Project", project: "Project", kind: "board", closable: false },
      ]}
      active="source"
      onSelect={() => {}}
      onClose={close}
      onAdd={add}
    >
      <IssueTabPanel value="source" />
    </IssueTabs>,
  );

  expect(button("Project").getAttribute("aria-selected")).toBe("true");
  key("Backspace", button("Project"));
  click(button("New tab"));

  expect(close).not.toHaveBeenCalled();
  expect(add).toHaveBeenCalledOnce();
});
