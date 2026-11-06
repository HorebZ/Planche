import {
  ArrowUpRight,
  Box,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Plus,
  X,
} from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { IssueCardData } from "@/components/ui/issue-card";
import { LabelChip } from "@/components/ui/label-chip";
import { PriorityGlyph } from "@/components/ui/planche-glyph";
import { StatusChip, type StatusKey } from "@/components/ui/status";
import { cn } from "@/lib/cn";

export function IssueDetail({
  itemId,
  item,
  project,
  status,
  githubState,
  notice,
  editable,
  expanded = false,
  onExpandedChange,
  onOpenTab,
  active = true,
  onBack,
  onPrevious,
  onNext,
  onStatus,
  onAssign,
  onGitHub,
  onEditTitle,
  children,
}: {
  itemId: string;
  item: IssueCardData | null;
  project: string;
  status: { name: string; tone: StatusKey } | null;
  githubState?: "open" | "closed";
  notice?: string;
  editable: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenTab?: () => void;
  active?: boolean;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onStatus?: () => void;
  onAssign?: () => void;
  onGitHub?: () => void;
  onEditTitle?: () => void;
  children?: ReactNode;
}) {
  const anchor = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (active && !document.activeElement?.closest('[role="tablist"]')) {
      anchor.current?.focus({ preventScroll: true });
    }
  }, [active]);

  return (
    <article
      data-slot="issue-detail"
      data-expanded={expanded}
      data-active={active}
      aria-label="Issue detail"
      className={cn(
        "absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-bg",
        !expanded &&
          "@min-[960px]:static @min-[960px]:w-[480px] @min-[960px]:shrink-0 @min-[960px]:border-line @min-[960px]:border-l",
        !active && "hidden",
      )}
    >
      <header
        data-tauri-drag-region
        className="flex h-10 shrink-0 items-center gap-1 px-3 text-md [&_button]:size-6 [&_svg]:size-3.5"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close detail"
          onClick={onBack}
        >
          <X />
        </Button>
        <span className="min-w-0 flex-1 truncate text-fg-3">{project}</span>
        {onOpenTab ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open in tab"
            title="Open in tab"
            onClick={onOpenTab}
          >
            <Plus />
          </Button>
        ) : null}
        {onExpandedChange ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Show side panel" : "Expand detail"}
            onClick={() => onExpandedChange(!expanded)}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
        ) : null}
        {onPrevious || onNext ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous issue"
              disabled={!onPrevious}
              onClick={onPrevious}
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next issue"
              disabled={!onNext}
              onClick={onNext}
            >
              <ChevronDown />
            </Button>
          </>
        ) : null}
        {onGitHub ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={item?.number != null ? "Open on GitHub" : "Open project on GitHub"}
            onClick={onGitHub}
          >
            <ArrowUpRight />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-6 py-7">
          <div
            ref={anchor}
            data-item-id={itemId}
            tabIndex={-1}
            className="outline-none"
          >
            <p className="mb-3 text-fg-3 text-sm">
              {item?.repo}
              {item?.number != null
                ? ` #${item.number}`
                : item
                  ? editable
                    ? "Draft"
                    : "Restricted item"
                  : "Unavailable item"}
            </p>
            <div className="mb-6 flex items-start gap-2">
              <h1 className="min-w-0 flex-1 break-words font-semibold text-2xl">
                {item?.title ?? "Item no longer available"}
              </h1>
              {onEditTitle ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onEditTitle}
                >
                  Edit title
                </Button>
              ) : null}
            </div>
            {notice ? <p className="mb-6 text-fg-2">{notice}</p> : null}
            {item ? (
              <dl className="flex flex-wrap items-center gap-2 text-sm">
                {!githubState ? (
                  <div className="min-w-0 max-w-full">
                    <dt className="sr-only">Project</dt>
                    <dd className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-fg-3 shadow-card">
                      <Box
                        aria-hidden
                        className="size-3.5 shrink-0"
                      />
                      <span className="min-w-0 break-words">{project}</span>
                    </dd>
                  </div>
                ) : null}
                {githubState ? (
                  <div>
                    <dt className="sr-only">State</dt>
                    <dd className="inline-flex min-h-8 items-center rounded-full bg-card px-3 py-1.5 shadow-card">
                      <StatusChip
                        status={githubState === "open" ? "todo" : "done"}
                        label={githubState === "open" ? "Open" : "Closed"}
                      />
                    </dd>
                  </div>
                ) : (
                  <div className="min-w-0 max-w-full">
                    <dt className="sr-only">Status</dt>
                    <dd>
                      <Button
                        size="sm"
                        className="h-auto min-h-8 max-w-full rounded-full px-3 py-1.5 [&_[data-slot=status-chip]]:whitespace-normal"
                        disabled={!editable || !status || !onStatus}
                        onClick={onStatus}
                        aria-label="Change project status"
                      >
                        {status ? (
                          <StatusChip
                            status={status.tone}
                            label={status.name}
                          />
                        ) : (
                          "No status"
                        )}
                      </Button>
                    </dd>
                  </div>
                )}
                {item.priority ? (
                  <div>
                    <dt className="sr-only">Priority</dt>
                    <dd className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-card">
                      <PriorityGlyph priority={item.priority} />
                      <span className="capitalize">{item.priority}</span>
                    </dd>
                  </div>
                ) : null}
                <div className="min-w-0 max-w-full">
                  <dt className="sr-only">Assignees</dt>
                  <dd>
                    <Button
                      size="sm"
                      disabled={!editable || !onAssign}
                      onClick={onAssign}
                      aria-label="Change assignees"
                      className="group/assignees h-auto min-h-8 max-w-full rounded-full px-3 py-1.5"
                    >
                      <AvatarStack
                        users={item.assignees}
                        size={18}
                        on="bg"
                      />
                      <span className="whitespace-normal break-words text-left">
                        {item.assignees.map((user) => user.login).join(", ") ||
                          (editable || githubState ? "Unassigned" : "Unavailable")}
                      </span>
                    </Button>
                  </dd>
                </div>
                {item.labels.length ? (
                  <div className="contents">
                    <dt className="sr-only">Labels</dt>
                    <dd className="contents">
                      {item.labels.map((label) => (
                        <LabelChip
                          key={label.name}
                          {...label}
                          title={label.name}
                          className="h-8 min-w-0 max-w-full rounded-full bg-card px-3 font-normal text-sm shadow-card"
                        />
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    </article>
  );
}
