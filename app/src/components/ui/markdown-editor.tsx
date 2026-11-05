import { Bold, Code, Italic, Link, List, ListTodo, Quote, Strikethrough } from "lucide-react";
import { type ComponentProps, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

const tools = [
  { label: "Bold", icon: Bold, prefix: "**", suffix: "**" },
  { label: "Italic", icon: Italic, prefix: "_", suffix: "_" },
  { label: "Strikethrough", icon: Strikethrough, prefix: "~~", suffix: "~~" },
  { label: "Link", icon: Link, prefix: "[", suffix: "](https://)", link: true },
  { label: "Code", icon: Code, prefix: "`", suffix: "`" },
  { label: "Quote", icon: Quote, prefix: "> ", line: true },
  { label: "Bulleted list", icon: List, prefix: "- ", line: true },
  { label: "Task list", icon: ListTodo, prefix: "- [ ] ", line: true, task: true },
];

export function MarkdownEditor({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
  onKeyDown,
  sourceUrl,
  onOpenLink,
  className,
  editorClassName,
  "aria-describedby": describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onKeyDown?: ComponentProps<"textarea">["onKeyDown"];
  sourceUrl?: string;
  onOpenLink: (url: string) => void;
  className?: string;
  editorClassName?: string;
  "aria-describedby"?: string;
}) {
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<[number, number] | null>(null);
  const [mode, setMode] = useState("write");

  useLayoutEffect(() => {
    if (selection.current && editor.current) {
      editor.current.focus();
      editor.current.setSelectionRange(...selection.current);
      selection.current = null;
    }
  });

  const format = (tool: (typeof tools)[number]) => {
    if (!editor.current || disabled) {
      return;
    }

    let { selectionStart: start, selectionEnd: end } = editor.current;

    if (tool.line) {
      start = value.slice(0, start).lastIndexOf("\n") + 1;
      const lineEnd = value.indexOf("\n", end > start && value[end - 1] === "\n" ? end - 1 : end);
      end = lineEnd === -1 ? value.length : lineEnd;
    }

    const selected = value.slice(start, end);
    const suffix = tool.suffix ?? "";
    let replacement: string;

    if (tool.task) {
      const lines = selected.split("\n");
      const marker = /^(\s*)[-+*]\s+\[[ xX]\](?:[ \t]+|$)/;
      const remove = lines.every((line) => marker.test(line));
      replacement = lines
        .map((line) =>
          remove
            ? line.replace(marker, "$1")
            : marker.test(line)
              ? line
              : line.replace(/^(\s*)(?:[-+*]\s+)?/, `$1${tool.prefix}`),
        )
        .join("\n");
      selection.current = [start, start + replacement.length];
    } else if (tool.line) {
      const lines = selected.split("\n");
      const remove = lines.every((line) => line.startsWith(tool.prefix));
      replacement = lines
        .map((line) =>
          remove
            ? line.slice(tool.prefix.length)
            : line.startsWith(tool.prefix)
              ? line
              : tool.prefix + line,
        )
        .join("\n");
      selection.current = [start, start + replacement.length];
    } else if (tool.link) {
      const link = [
        ...value.matchAll(/\[((?:\\.|[^\]\\\n])*)\]\(((?:\\.|[^()\\\n]|\([^()\n]*\))*)\)/g),
      ].find((match) => match.index <= start && match.index + match[0].length >= end);

      if (link) {
        start = link.index;
        end = start + link[0].length;
        replacement = link[1];
        selection.current = [start, start + replacement.length];
      } else {
        replacement = `${tool.prefix}${selected}${suffix}`;
        const urlStart = start + tool.prefix.length + selected.length + 2;
        selection.current = [urlStart, start + replacement.length - 1];
      }
    } else if (
      start >= tool.prefix.length &&
      value.slice(start - tool.prefix.length, start) === tool.prefix &&
      value.slice(end, end + suffix.length) === suffix
    ) {
      start -= tool.prefix.length;
      end += suffix.length;
      replacement = selected;
      selection.current = [start, start + replacement.length];
    } else if (
      selected.length >= tool.prefix.length + suffix.length &&
      selected.startsWith(tool.prefix) &&
      selected.endsWith(suffix)
    ) {
      replacement = selected.slice(tool.prefix.length, -suffix.length);
      selection.current = [start, start + replacement.length];
    } else {
      replacement = `${tool.prefix}${selected}${suffix}`;
      const nextStart = start + tool.prefix.length;
      selection.current = [nextStart, nextStart + selected.length];
    }

    onChange(value.slice(0, start) + replacement + value.slice(end));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={id}
        className="block font-medium"
      >
        {label}
      </label>
      <div
        data-slot="markdown-editor"
        className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-line border-b bg-bg-sunken p-1.5">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => value && setMode(value)}
            aria-label={`${label} mode`}
          >
            <ToggleGroupItem
              value="write"
              type="button"
            >
              Write
            </ToggleGroupItem>
            <ToggleGroupItem
              value="preview"
              type="button"
            >
              Preview
            </ToggleGroupItem>
          </ToggleGroup>
          <TooltipProvider>
            <fieldset
              aria-label="Markdown formatting"
              className="flex min-w-0 flex-wrap items-center gap-0.5"
            >
              {tools.map((tool) => (
                <Tooltip key={tool.label}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-6 px-0 text-fg-2 disabled:bg-transparent"
                      aria-label={tool.label}
                      disabled={disabled || mode === "preview"}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => format(tool)}
                    >
                      <tool.icon aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{tool.label}</TooltipContent>
                </Tooltip>
              ))}
            </fieldset>
          </TooltipProvider>
        </div>
        {mode === "preview" ? (
          <section
            aria-label={`${label} preview`}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the preview.
            tabIndex={0}
            className={cn("min-h-40 overflow-auto p-3 focus-visible:shadow-ring", editorClassName)}
          >
            {value.trim() ? (
              <Markdown
                body={value}
                sourceUrl={sourceUrl}
                onOpenLink={onOpenLink}
              />
            ) : (
              <p className="text-fg-3">Nothing to preview.</p>
            )}
          </section>
        ) : (
          <Textarea
            ref={editor}
            id={id}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            aria-describedby={[`${id}-help`, describedBy].filter(Boolean).join(" ")}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "rounded-none bg-transparent p-3 shadow-none focus-within:shadow-[inset_0_0_0_2px_var(--pl-focus)] hover:bg-transparent [&_textarea]:min-h-40",
              editorClassName,
            )}
          />
        )}
        <p
          id={`${id}-help`}
          className="border-line border-t px-3 py-2 text-fg-3 text-xs"
        >
          Markdown supported.
        </p>
      </div>
    </div>
  );
}
