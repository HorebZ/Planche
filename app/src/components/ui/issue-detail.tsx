import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { IssueCardData } from "@/components/ui/issue-card";
import { LabelSummary } from "@/components/ui/label-summary";
import { StatusChip, type StatusKey } from "@/components/ui/status";

export function IssueDetail({
  itemId,
  item,
  project,
  status,
  notice,
  editable,
  onBack,
  onPrevious,
  onNext,
  onStatus,
  onAssign,
  onGitHub,
}: {
  itemId: string;
  item: IssueCardData | null;
  project: string;
  status: { name: string; tone: StatusKey } | null;
  notice?: string;
  editable: boolean;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onStatus: () => void;
  onAssign: () => void;
  onGitHub?: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    anchor.current?.focus({ preventScroll: true });
  }, []);

  return (
    <article
      data-slot="issue-detail"
      aria-label="Issue detail"
      className="absolute inset-0 z-10 flex flex-col bg-bg"
    >
      <header
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center gap-2 border-line border-b px-4"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
        >
          <ArrowLeft /> Back to project
        </Button>
        <span className="min-w-0 flex-1 truncate text-fg-3">{project}</span>
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
            size="sm"
            onClick={onGitHub}
          >
            <ExternalLink />
            {item?.number != null ? "Open on GitHub" : "Open project on GitHub"}
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-8 py-7">
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
        </div>
      </div>
    </article>
  );
}
