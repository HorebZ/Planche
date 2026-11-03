import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Maximize2,
  Minimize2,
  SquarePlus,
  X,
} from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { IssueCardData } from "@/components/ui/issue-card";
import { LabelSummary } from "@/components/ui/label-summary";
import { StatusChip, type StatusKey } from "@/components/ui/status";
import { cn } from "@/lib/cn";

export function IssueDetail({
  itemId,
  item,
  project,
  status,
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
  children,
}: {
  itemId: string;
  item: IssueCardData | null;
  project: string;
  status: { name: string; tone: StatusKey } | null;
  notice?: string;
  editable: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenTab?: () => void;
  active?: boolean;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onStatus: () => void;
  onAssign: () => void;
  onGitHub?: () => void;
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
      )}
    >
      <header
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center gap-1 border-line border-b px-3"
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
            <SquarePlus />
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
        {onGitHub ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={item?.number != null ? "Open on GitHub" : "Open project on GitHub"}
            onClick={onGitHub}
          >
            <ExternalLink />
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
            <h1 className="mb-6 break-words font-semibold text-2xl">
              {item?.title ?? "Item no longer available"}
            </h1>
            {notice ? <p className="mb-6 text-fg-2">{notice}</p> : null}
            {item ? (
              <dl className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-x-5 gap-y-4 border-line border-y py-5 text-sm">
                <dt className="text-fg-3">Project</dt>
                <dd className="break-words">{project}</dd>
                <dt className="text-fg-3">Status</dt>
                <dd>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!editable || !status}
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
                <dt className="text-fg-3">Assignees</dt>
                <dd>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!editable}
                    onClick={onAssign}
                    aria-label="Change assignees"
                    className="h-auto min-h-6 max-w-full py-1"
                  >
                    <AvatarStack
                      users={item.assignees}
                      size={18}
                      on="bg"
                    />
                    <span className="whitespace-normal break-words text-left">
                      {item.assignees.map((user) => user.login).join(", ") ||
                        (editable ? "Unassigned" : "Unavailable")}
                    </span>
                  </Button>
                </dd>
                {item.labels.length ? (
                  <>
                    <dt className="text-fg-3">Labels</dt>
                    <dd className="min-w-0">
                      <LabelSummary labels={item.labels} />
                    </dd>
                  </>
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
