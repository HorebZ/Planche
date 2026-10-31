import { Component, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

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
