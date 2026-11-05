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

test.each(["issues", "pull"])("GitHub references use the source %s repository", (kind) => {
  const open = vi.fn();

  render(
    <Markdown
      body="Fixes #61635, **#42** and other-owner/other.repo#123."
      sourceUrl={`https://github.com/source-owner/source-repo/${kind}/35#discussion`}
      onOpenLink={open}
    />,
  );

  const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];

  expect(links.map((link) => link.textContent)).toEqual([
    "#61635",
    "#42",
    "other-owner/other.repo#123",
  ]);
  for (const link of links) {
    click(link);
  }

  expect(open.mock.calls.map(([url]) => url)).toEqual([
    "https://github.com/source-owner/source-repo/issues/61635",
    "https://github.com/source-owner/source-repo/issues/42",
    "https://github.com/other-owner/other.repo/issues/123",
  ]);
});

test("references leave code, existing links and non-reference hashes intact", () => {
  render(
    <Markdown
      body={
        "`#61635`\n\n```text\nother/repo#42\n```\n\n[#123](https://example.com)\n\n# Heading\n\nC#123 #61635abc #0 ##42 #123_suffix https://example.com/#99"
      }
      sourceUrl="https://github.com/source/repo/issues/35"
      onOpenLink={() => {}}
    />,
  );

  expect([...document.querySelectorAll<HTMLAnchorElement>("a")].map((link) => link.href)).toEqual([
    "https://example.com/",
  ]);
  expect(get("code").textContent).toBe("#61635");
  expect(get("pre code").textContent).toContain("other/repo#42");
});

test.each([undefined, "https://example.com/owner/repo/issues/35"])(
  "bare references stay as text without a GitHub repository: %s",
  (sourceUrl) => {
    render(
      <Markdown
        body="#61635 and owner/repo#42"
        sourceUrl={sourceUrl}
        onOpenLink={() => {}}
      />,
    );

    const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];

    expect(links.map((link) => link.href)).toEqual(["https://github.com/owner/repo/issues/42"]);
    expect(document.body.textContent).toContain("#61635");
  },
);

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
