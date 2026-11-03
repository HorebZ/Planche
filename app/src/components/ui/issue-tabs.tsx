import { X } from "lucide-react";
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
      className="flex min-h-0 min-w-0 flex-1 flex-col"
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
          className="flex shrink-0 overflow-x-auto border-line border-b bg-bg-sunken"
        >
          <Tabs.Trigger
            value="source"
            data-tab-id="source"
            title={`Return to ${source}`}
            className="h-10 max-w-[220px] shrink-0 truncate border-line border-r px-4 text-fg-2 focus-visible:shadow-ring data-[state=active]:bg-bg data-[state=active]:text-fg"
          >
            {source}
          </Tabs.Trigger>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={cn(
                "flex shrink-0 items-center border-line border-r",
                active === tab.id && "bg-bg",
              )}
            >
              <Tabs.Trigger
                value={tab.id}
                title={`${tab.title} · ${tab.project}`}
                className="h-10 w-[200px] truncate px-3 text-left text-fg-2 focus-visible:shadow-ring data-[state=active]:text-fg"
              >
                {tab.title}
              </Tabs.Trigger>
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 size-6"
                aria-label={`Close tab: ${tab.title}`}
                onClick={() => close(tab.id)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </Tabs.List>
      ) : null}
      <div className="relative flex min-h-0 min-w-0 flex-1">{children}</div>
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
