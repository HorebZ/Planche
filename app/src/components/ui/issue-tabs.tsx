import { Columns3, Plus, X } from "lucide-react";
import { Tabs } from "radix-ui";
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { type ProjectTone, projectTones } from "@/components/ui/sidebar";
import { type StatusKey, StatusSquare } from "@/components/ui/status";
import { commandFor } from "@/keyboard/shortcuts";
import { cn } from "@/lib/cn";

export function IssueTabs({
  tabs,
  active,
  onSelect,
  onClose,
  onAdd,
  addDisabled,
  children,
}: {
  tabs: {
    id: string;
    title: string;
    project: string;
    kind?: "board";
    tone?: ProjectTone;
    closable?: boolean;
    status?: StatusKey;
  }[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  addDisabled?: boolean;
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
      ?.querySelector(`[data-tab-id="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <Tabs.Root
      value={active}
      onValueChange={onSelect}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
    >
      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center gap-1"
      >
        <Tabs.List
          data-tauri-drag-region
          ref={list}
          aria-label="Open tabs"
          onKeyDown={(event) => {
            const id = (event.target as HTMLElement).closest<HTMLElement>("[data-tab-id]")?.dataset
              .tabId;

            if (
              id &&
              tabs.find((tab) => tab.id === id)?.closable !== false &&
              commandFor(event.nativeEvent, "tabs") === "tab.close"
            ) {
              event.preventDefault();
              close(id);
            }
          }}
          className="flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 py-0.5 [&::-webkit-scrollbar]:hidden"
        >
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
                className="flex h-7 min-w-0 items-center gap-2 rounded-lg px-3 text-left font-medium text-md focus-visible:shadow-ring"
              >
                {tab.kind === "board" ? (
                  <span
                    aria-hidden
                    className="relative size-3.5 shrink-0"
                  >
                    <Columns3 className="size-full" />
                    {tab.tone ? (
                      <span
                        data-slot="project-color"
                        className={cn(
                          "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-bg-sunken",
                          projectTones[tab.tone],
                        )}
                      />
                    ) : null}
                  </span>
                ) : (
                  <StatusSquare
                    status={tab.status ?? "draft"}
                    aria-hidden
                  />
                )}
                <span className="truncate">{tab.title}</span>
              </Tabs.Trigger>
              {tab.closable !== false ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1 size-6 shrink-0 rounded-md opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                  aria-label={`Close tab: ${tab.title}`}
                  onClick={() => close(tab.id)}
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </div>
          ))}
        </Tabs.List>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-fg-3"
          aria-label="New tab"
          title="New tab"
          onClick={onAdd}
          disabled={addDisabled}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
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
