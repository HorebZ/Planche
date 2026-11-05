import { Component, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type ExtraProps } from "react-markdown";

type MarkdownElement = NonNullable<ExtraProps["node"]>;

function githubReferences(sourceUrl?: string) {
  const repository = sourceUrl?.match(
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/\d+(?:[/?#]|$)/,
  )?.[1];

  return function transform(node: Pick<MarkdownElement, "children">) {
    node.children = node.children.flatMap((child): MarkdownElement["children"] => {
      if (child.type === "element") {
        if (!["a", "code", "pre"].includes(child.tagName)) {
          transform(child);
        }

        return [child];
      }

      if (child.type !== "text") {
        return [child];
      }

      const parts: MarkdownElement["children"] = [];
      const references = child.value.matchAll(
        /(?<![\p{L}\p{N}_/#])(?:([a-z\d][a-z\d-]*\/[a-z\d_.-]+))?#([1-9]\d*)(?![\p{L}\p{N}_])/giu,
      );
      let offset = 0;

      for (const match of references) {
        const target = match[1] ?? repository;

        if (!target) {
          continue;
        }

        parts.push(
          { type: "text", value: child.value.slice(offset, match.index) },
          {
            type: "element",
            tagName: "a",
            // GitHub resolves this route for both issues and pull requests.
            properties: { href: `https://github.com/${target}/issues/${match[2]}` },
            children: [{ type: "text", value: match[0] }],
          },
        );
        offset = match.index + match[0].length;
      }

      return [...parts, { type: "text", value: child.value.slice(offset) }];
    });
  };
}

function safeUrl(value: string, sourceUrl?: string) {
  if (!defaultUrlTransform(value)) {
    return undefined;
  }

  try {
    const url = new URL(value, sourceUrl);

    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

class PlainTextFallback extends Component<
  { body: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <div className="whitespace-pre-wrap break-words">{this.props.body}</div>
    ) : (
      this.props.children
    );
  }
}

export function Markdown({
  body,
  sourceUrl,
  onOpenLink,
}: {
  body: string;
  sourceUrl?: string;
  onOpenLink: (url: string) => void;
}) {
  return (
    <div
      data-slot="markdown"
      className="space-y-3 break-words text-fg-2 leading-relaxed [&_a:focus-visible]:shadow-ring [&_a]:rounded-xs [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-border-strong [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded-sm [&_code]:bg-hover [&_code]:px-1 [&_code]:font-mono [&_hr]:border-line [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg-sunken [&_pre]:p-3 [&_pre]:text-sm [&_ul]:list-disc [&_ul]:pl-5"
    >
      <PlainTextFallback
        key={body}
        body={body}
      >
        <ReactMarkdown
          skipHtml
          rehypePlugins={[[githubReferences, sourceUrl]]}
          urlTransform={(value, key) => (key === "href" ? safeUrl(value, sourceUrl) : undefined)}
          components={{
            h1: ({ children }) => <h3 className="font-semibold text-fg text-lg">{children}</h3>,
            h2: ({ children }) => <h4 className="font-semibold text-fg">{children}</h4>,
            h3: ({ children }) => <h5 className="font-semibold text-fg">{children}</h5>,
            h4: ({ children }) => <h6 className="font-semibold">{children}</h6>,
            h5: ({ children }) => <h6 className="font-semibold">{children}</h6>,
            h6: ({ children }) => <h6 className="font-semibold">{children}</h6>,
            a: ({ href, children }) =>
              href ? (
                // WebKit needs an explicit tab stop in its default keyboard mode.
                <a
                  href={href}
                  tabIndex={0}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenLink(href);
                  }}
                >
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
            img: ({ alt }) => (
              <span className="text-fg-3">Image not loaded{alt ? `: ${alt}` : ""}</span>
            ),
          }}
        >
          {body}
        </ReactMarkdown>
      </PlainTextFallback>
    </div>
  );
}
