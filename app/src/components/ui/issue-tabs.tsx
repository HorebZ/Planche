import { Columns3, FileText, X } from "lucide-react";
import { Tabs } from "radix-ui";
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { commandFor } from "@/keyboard/shortcuts";
import { cn } from "@/lib/cn";

export function IssueTabs({
  tabs,
  active,
  source,
  onSelect,
  onClose,
  children,
}: {
  tabs: { id: string; title: string; project: string }[];
  active: string | null;
  source: string;
  onSelect: (id: string | null) => void;
  onClose: (id: string) => void;
  children: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const close = (id: string) => {
    onClose(id);
    requestAnimationFrame(() =>
      list.current?.querySelector<HTMLButtonElement>('[data-state="active"]')?.focus(),
    );
  };

  useLayoutEffect(() => {
    list.current
      ?.querySelector(`[data-tab-id="${CSS.escape(active ?? "source")}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <Tabs.Root
      value={active ?? "source"}
      onValueChange={(id) => onSelect(id === "source" ? null : id)}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
    >
      {tabs.length ? (
        <Tabs.List
          ref={list}
          aria-label="Open issues"
          onKeyDown={(event) => {
            const id = (event.target as HTMLElement).closest<HTMLElement>("[data-tab-id]")?.dataset
              .tabId;

            if (id && id !== "source" && commandFor(event.nativeEvent, "tabs") === "tab.close") {
              event.preventDefault();
              close(id);
            }
          }}
          className="flex shrink-0 items-center gap-1 overflow-x-auto px-1 py-0.5 [&::-webkit-scrollbar]:hidden"
        >
          <Tabs.Trigger
            value="source"
            data-tab-id="source"
            title={`Return to ${source}`}
            className="flex h-7 max-w-[240px] shrink-0 items-center gap-1.5 rounded-lg bg-hover px-2.5 font-medium text-fg-3 text-md transition-colors hover:bg-active hover:text-fg-2 focus-visible:shadow-ring data-[state=active]:bg-active data-[state=active]:text-fg"
          >
            <Columns3
              className="size-3.5 shrink-0"
              aria-hidden
            />
            <span className="truncate">{source}</span>
          </Tabs.Trigger>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={cn(
                "group flex max-w-[260px] shrink-0 items-center rounded-lg bg-hover text-fg-3 transition-colors hover:bg-active hover:text-fg-2",
                active === tab.id && "bg-active text-fg",
              )}
            >
              <Tabs.Trigger
                value={tab.id}
                title={`${tab.title} · ${tab.project}`}
                className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg pr-1 pl-2.5 text-left font-medium text-md focus-visible:shadow-ring"
              >
                <FileText
                  className="size-3.5 shrink-0"
                  aria-hidden
                />
                <span className="truncate">{tab.title}</span>
              </Tabs.Trigger>
              <Button
                variant="ghost"
                size="icon"
                className="mr-0.5 size-6 rounded-md opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                aria-label={`Close tab: ${tab.title}`}
                onClick={() => close(tab.id)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </Tabs.List>
      ) : null}
      <div
        data-slot="issue-tabs-content"
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl bg-bg shadow-panel"
      >
        {children}
      </div>
    </Tabs.Root>
  );
}

export function IssueTabPanel({ className, ...props }: ComponentProps<typeof Tabs.Content>) {
  // Inactive panes keep their layout for virtualizers and their editors for unsent text.
  return (
    <Tabs.Content
      forceMount
      tabIndex={-1}
      className={cn(
        "@container relative flex min-h-0 min-w-0 flex-1 overflow-hidden outline-none data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible data-[state=inactive]:absolute data-[state=inactive]:inset-0",
        className,
      )}
      {...props}
    />
  );
}
