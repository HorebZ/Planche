// @vitest-environment happy-dom
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { button, click, get, render } from "@/test-support";
import { MarkdownEditor } from "./markdown-editor";

function Editor({ initial = "", disabled = false }: { initial?: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);

  return (
    <MarkdownEditor
      label="Comment"
      value={value}
      onChange={setValue}
      disabled={disabled}
      onOpenLink={() => {}}
    />
  );
}

test.each([
  ["Bold", "**selected**"],
  ["Italic", "_selected_"],
  ["Strikethrough", "~~selected~~"],
  ["Code", "`selected`"],
  ["Link", "[selected](https://)"],
])("%s wraps only the selection and restores focus", (tool, expected) => {
  render(<Editor initial="Before selected after" />);
  const editor = get<HTMLTextAreaElement>("textarea");
  editor.setSelectionRange(7, 15);

  click(button(tool));

  expect(editor.value).toBe(`Before ${expected} after`);
  expect(document.activeElement).toBe(editor);
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  expect(selected).toBe(tool === "Link" ? "https://" : "selected");
  click(button(tool));

  expect(editor.value).toBe("Before selected after");
  expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe("selected");
  click(button(tool));

  expect(editor.value).toBe(`Before ${expected} after`);
});

test.each([
  ["Quote", "> first\n> second"],
  ["Bulleted list", "- first\n- second"],
  ["Task list", "- [ ] first\n- [ ] second"],
])("%s formats whole selected lines without affecting the next line", (tool, expected) => {
  render(<Editor initial={"first\nsecond\nuntouched"} />);
  const editor = get<HTMLTextAreaElement>("textarea");
  editor.setSelectionRange(2, 13);

  click(button(tool));

  expect(editor.value).toBe(`${expected}\nuntouched`);
  click(button(tool));

  expect(editor.value).toBe("first\nsecond\nuntouched");
  click(button(tool));

  expect(editor.value).toBe(`${expected}\nuntouched`);
});

test("formatting at an empty cursor leaves the caret inside the delimiters", () => {
  render(<Editor />);
  const editor = get<HTMLTextAreaElement>("textarea");

  click(button("Bold"));

  expect(editor.value).toBe("****");
  expect(editor.selectionStart).toBe(2);
  expect(editor.selectionEnd).toBe(2);
  click(button("Bold"));

  expect(editor.value).toBe("");
  expect(editor.selectionStart).toBe(0);
});

test.each([
  ["Bold", "**selected**"],
  ["Italic", "_selected_"],
  ["Strikethrough", "~~selected~~"],
  ["Code", "`selected`"],
  ["Link", "[selected](https://example.com/path_(one))"],
])("%s removes formatting when the markers are also selected", (tool, initial) => {
  render(<Editor initial={initial} />);
  const editor = get<HTMLTextAreaElement>("textarea");
  editor.setSelectionRange(0, initial.length);

  click(button(tool));

  expect(editor.value).toBe("selected");
  expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe("selected");
});

test("mixed bulleted lines are normalized without stacking markers", () => {
  render(<Editor initial={"- first\nsecond"} />);
  const editor = get<HTMLTextAreaElement>("textarea");
  editor.setSelectionRange(0, editor.value.length);

  click(button("Bulleted list"));

  expect(editor.value).toBe("- first\n- second");
  click(button("Bulleted list"));

  expect(editor.value).toBe("first\nsecond");
});

test("preview renders Markdown, disables formatting and retains the exact draft", () => {
  render(<Editor initial={"Ready **for review**.  \n"} />);

  click(button("Preview"));

  expect(get("strong").textContent).toBe("for review");
  expect(document.querySelector("textarea")).toBeNull();
  expect(button("Bold").disabled).toBe(true);
  click(button("Write"));

  expect(get<HTMLTextAreaElement>("textarea").value).toBe("Ready **for review**.  \n");
});

test("empty preview explains its state and disabled editors never change the value", () => {
  const change = vi.fn();
  render(
    <MarkdownEditor
      label="Comment"
      value=""
      onChange={change}
      disabled
      onOpenLink={() => {}}
    />,
  );

  click(button("Bold"));
  expect(get<HTMLTextAreaElement>("textarea").disabled).toBe(true);
  expect(change).not.toHaveBeenCalled();
  click(button("Preview"));

  expect(get('section[aria-label="Comment preview"]').textContent).toBe("Nothing to preview.");
});

test("task lists convert bullets and retain completed tasks without stacking markers", () => {
  render(<Editor initial={"- [x] first\n- second\n  third\nuntouched"} />);
  const editor = get<HTMLTextAreaElement>("textarea");
  editor.setSelectionRange(0, editor.value.indexOf("untouched"));

  click(button("Task list"));

  expect(editor.value).toBe("- [x] first\n- [ ] second\n  - [ ] third\nuntouched");
  click(button("Task list"));

  expect(editor.value).toBe("first\nsecond\n  third\nuntouched");
});

test("an empty task list can be inserted and removed at the cursor", () => {
  render(<Editor />);
  const editor = get<HTMLTextAreaElement>("textarea");

  click(button("Task list"));

  expect(editor.value).toBe("- [ ] ");
  click(button("Task list"));

  expect(editor.value).toBe("");
});
