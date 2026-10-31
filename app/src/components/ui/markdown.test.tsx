// @vitest-environment happy-dom
import { useState } from "react";
import * as parser from "react-markdown";
import { expect, test, vi } from "vitest";
import { button, click, get, render } from "@/test-support";
import { Markdown } from "./markdown";

vi.mock("react-markdown", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-markdown")>();

  return { ...original, default: vi.fn(original.default) };
});

test("renders CommonMark headings, lists, emphasis, quotes and code without raw HTML", () => {
  render(
    <Markdown
      body={
        '# Heading\n\n**Bold** and *emphasis*.\n\n- One\n- Two\n\n1. First\n2. Second\n\n> Quote\n\n```html\n<script>literal code</script>\n```\n\n<script>alert(1)</script>\n<iframe src="https://example.com"></iframe>'
      }
      onOpenLink={() => {}}
    />,
  );

  expect(get("h3").textContent).toBe("Heading");
  expect(document.querySelectorAll("ul > li")).toHaveLength(2);
  expect(document.querySelectorAll("ol > li")).toHaveLength(2);
  expect(get("strong").textContent).toBe("Bold");
  expect(get("em").textContent).toBe("emphasis");
  expect(get("blockquote").textContent).toContain("Quote");
  expect(get("pre code").textContent).toContain("<script>literal code</script>");
  expect(document.querySelector("script, iframe")).toBeNull();
});

test.each([
  "http://[",
  "javascript:alert(1)",
  "java&#x73;cript:alert(1)",
  "jav&#x09;ascript:alert(1)",
  "data:text/html,payload",
  "file:///etc/passwd",
  "vbscript:payload",
  "tauri://localhost",
  "blob:https://example.com/id",
])("keeps a forbidden URL as text: %s", (url) => {
  const open = vi.fn();

  render(
    <Markdown
      body={`[Unsafe](<${url}>)`}
      sourceUrl="https://github.com/HorebZ/Planche/issues/35"
      onOpenLink={open}
    />,
  );

  expect(document.body.textContent).toContain("Unsafe");
  expect(document.querySelector("a")).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

test("allowed links resolve against the issue and open through the provided action", () => {
  const open = vi.fn();

  render(
    <Markdown
      body="[HTTPS](https://example.com) [HTTP](http://example.com) [Mail](mailto:dev@example.com) [Relative](../34)"
      sourceUrl="https://github.com/HorebZ/Planche/issues/35"
      onOpenLink={open}
    />,
  );

  for (const link of document.querySelectorAll<HTMLAnchorElement>("a")) {
    click(link);
  }

  expect(open.mock.calls.map(([url]) => url)).toEqual([
    "https://example.com/",
    "http://example.com/",
    "mailto:dev@example.com",
    "https://github.com/HorebZ/Planche/34",
  ]);
});

test("neither Markdown images nor raw HTML can create remote image elements", () => {
  render(
    <Markdown
      body={
        '![Remote](https://example.com/track.png) ![Inline](data:image/png;base64,AAAA)\n\n<img src="https://example.com/track.png" onerror="alert(1)">'
      }
      onOpenLink={() => {}}
    />,
  );

  expect(document.body.textContent).toContain("Image not loaded: Remote");
  expect(document.body.textContent).toContain("Image not loaded: Inline");
  expect(document.querySelector("img, picture, source, svg")).toBeNull();
});

test("a renderer failure falls back to escaped plain text and a new body recovers", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const renderer = vi.mocked(parser.default).mockImplementation(() => {
    throw new Error("Renderer failed");
  });
  const body = "# Still readable\n\n<img src=remote>";
  function ChangeBody() {
    const [text, setText] = useState(body);

    return (
      <>
        <button
          type="button"
          onClick={() => setText("# Recovered")}
        >
          Next body
        </button>
        <Markdown
          body={text}
          onOpenLink={() => {}}
        />
      </>
    );
  }

  render(<ChangeBody />);

  expect(get('[data-slot="markdown"]').textContent).toBe(body);
  expect(document.querySelector("h3, img")).toBeNull();
  renderer.mockRestore();
  click(button("Next body"));

  expect(get("h3").textContent).toBe("Recovered");
});
