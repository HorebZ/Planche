import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import type { IssueCardData } from "@/components/ui/issue-card";
import { LabelChip } from "@/components/ui/label-chip";
import { type StatusKey, StatusSquare } from "@/components/ui/status";
import { commandFor } from "@/keyboard/shortcuts";

export function IssueListGroup({
  name,
  status,
  items,
  onOpen,
  onSelect,
  draft,
  onAddDraft,
  revealId,
  onRevealed,
}: {
  name: string;
  status: StatusKey;
  items: (IssueCardData & { id: string; pending?: boolean })[];
  onOpen: (id: string) => void;
  onSelect?: (id: string) => void;
  draft?: ReactNode;
  onAddDraft?: () => void;
  revealId?: string | null;
  onRevealed?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const groupRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!revealId || !items.some((item) => item.id === revealId)) {
      return;
    }

    if (!expanded) {
      setExpanded(true);

      return;
    }

    const row = groupRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${CSS.escape(revealId)}"]`,
    );

    row?.scrollIntoView({ block: "nearest" });
    row?.focus({ preventScroll: true });

    if (row) {
      onRevealed?.(revealId);
    }
  }, [revealId, expanded, items, onRevealed]);

  const drafting = Boolean(draft);

  useLayoutEffect(() => {
    if (drafting) {
      setExpanded(true);
    }
  }, [drafting]);

  return (
    <section
      ref={groupRef}
      data-slot="issue-list-group"
    >
      <div className="flex items-center bg-hover">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(event) => {
            const command = commandFor(event.nativeEvent, "board");

            if (command !== "column.prev" && command !== "column.next") {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            setExpanded(command === "column.next");
          }}
          aria-expanded={expanded}
          className="flex h-[34px] w-full items-center gap-2 border-line border-b bg-hover px-4 text-left font-medium focus-visible:bg-active"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 text-fg-3" />
          ) : (
            <ChevronRight className="size-3.5 text-fg-3" />
          )}
          <StatusSquare status={status} />
          <span>{name}</span>
          <span className="text-[12px] text-fg-3 tabular-nums">{items.length}</span>
        </button>
        {onAddDraft ? (
          <button
            type="button"
            aria-label={`Add draft to ${name}`}
            onClick={onAddDraft}
            className="mr-3 grid size-6 shrink-0 place-items-center rounded-sm text-fg-3 hover:bg-active focus-visible:shadow-ring"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>
      {draft}
      {expanded
        ? items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              data-slot="issue-list-row"
              data-item-id={item.id}
              onFocus={() => onSelect?.(item.id)}
              className="flex h-[38px] w-full items-center gap-2.5 border-line border-b px-4 text-left hover:bg-hover focus-visible:bg-active focus-visible:shadow-none"
            >
              <span className="w-4 shrink-0" />
              <span className="w-[68px] shrink-0 truncate text-[12px] text-fg-3 tabular-nums">
                {item.repo}
                {item.number != null ? `#${item.number}` : "Draft"}
              </span>
              <StatusSquare status={item.status ?? status} />
              <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
              {item.pending ? <span className="text-warning text-xs">Pending</span> : null}
              <div className="flex max-w-1/3 gap-1 overflow-hidden">
                {item.labels.map((label) => (
                  <LabelChip
                    key={label.name}
                    {...label}
                    className="h-[22px] shrink-0 rounded-full"
                  />
                ))}
              </div>
              <div className="flex w-7 justify-end">
                <AvatarStack
                  users={item.assignees}
                  size={18}
                />
              </div>
            </button>
          ))
        : null}
    </section>
  );
}
