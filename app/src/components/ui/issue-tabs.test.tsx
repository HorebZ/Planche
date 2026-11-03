// @vitest-environment happy-dom
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { button, get, key, render } from "@/test-support";
import { IssueTabPanel, IssueTabs } from "./issue-tabs";

function Workspace() {
  const [active, setActive] = useState<string | null>("issue-1");

  return (
    <IssueTabs
      tabs={[
        { id: "issue-1", title: "First issue", project: "Project A" },
        { id: "issue-2", title: "Second issue", project: "Project B" },
      ]}
      source="Project A"
      active={active}
      onSelect={setActive}
      onClose={() => setActive(null)}
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
      source="Project"
      active="issue-1"
      onSelect={() => {}}
      onClose={close}
    >
      <IssueTabPanel value="source" />
      <IssueTabPanel value="issue-1" />
      <IssueTabPanel value="issue-2" />
    </IssueTabs>,
  );

  key("Backspace", button("Close tab: Second issue"));

  expect(close).toHaveBeenCalledExactlyOnceWith("issue-2");
});
