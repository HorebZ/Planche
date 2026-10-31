import { cva, type VariantProps } from "class-variance-authority";
import {
  CircleMinus,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Hand,
} from "lucide-react";
import type { ComponentProps } from "react";
import { AvatarStack, type AvatarUser } from "@/components/ui/avatar";
import type { DisplayProperty } from "@/components/ui/display-menu";
import { Kbd } from "@/components/ui/kbd";
import type { CardLabel } from "@/components/ui/label-chip";
import { LabelSummary } from "@/components/ui/label-summary";
import {
  type Priority,
  PriorityGlyph,
  ProgressRing,
  StatusGlyph,
} from "@/components/ui/planche-glyph";
import { type StatusKey, StatusSquare } from "@/components/ui/status";
import { cn } from "@/lib/cn";

const issueCardVariants = cva(
  "relative flex min-w-0 flex-col gap-2 rounded-lg bg-card px-3 py-[11px] outline-none transition-[box-shadow,rotate,scale] ease-pl",
  {
    variants: {
      dragState: {
        none: "shadow-card hover:shadow-[var(--pl-shadow-card),0_0_0_1px_var(--pl-border-strong)] focus-visible:shadow-[0_0_0_2px_var(--pl-ring)]",
        lifted: "-rotate-2 scale-[1.02] shadow-drag",
        ghost: "shadow-card",
      },
    },
    defaultVariants: { dragState: "none" },
  },
);

type DragState = NonNullable<VariantProps<typeof issueCardVariants>["dragState"]>;
type CardBase = {
  repo?: string;
  number?: number;
  title: string;
  labels: CardLabel[];
  assignees: AvatarUser[];
  status?: StatusKey;
  priority?: Priority;
  createdAt?: string;
  parentTitle?: string;
  subIssues?: { completed: number; total: number };
  blockedBy?: number;
  blocking?: number;
  pullRequestCount?: number;
  pullRequest?: {
    number: number;
    title: string;
    state: "open" | "closed" | "merged";
    is_draft: boolean;
  };
};
export type IssueCardData = CardBase &
  (
    | { kind: "issue"; state: "open" | "closed" | "draft" }
    | { kind: "pr"; state: "open" | "closed" | "merged" | "draft" }
  );
export type IssueCardProps = IssueCardData & {
  hiddenProperties?: DisplayProperty[];
  selected?: boolean;
  updated?: boolean;
  pending?: boolean;
  dragState?: Exclude<DragState, "none">;
} & Omit<ComponentProps<"div">, "title" | "children">;

export function IssueCard({
  kind,
  state,
  repo,
  number,
  title,
  labels,
  assignees,
  status,
  priority,
  createdAt,
  parentTitle,
  subIssues,
  blockedBy = 0,
  blocking = 0,
  pullRequestCount = 0,
  pullRequest,
  selected = false,
  updated = false,
  pending = false,
  dragState,
  hiddenProperties = [],
  className,
  tabIndex = 0,
  ...props
}: IssueCardProps) {
  const resolvedStatus =
    status ??
    (state === "draft" ? "draft" : state === "closed" || state === "merged" ? "done" : "todo");
  const muted = resolvedStatus === "done" || resolvedStatus === "cancelled";
  const prLabel = pullRequest
    ? `Pull request #${pullRequest.number}: ${pullRequest.title} (${pullRequest.state === "open" && pullRequest.is_draft ? "draft" : pullRequest.state})`
    : `${pullRequestCount} linked pull requests`;
  const blockedLabel = `Blocked by ${blockedBy} issue${blockedBy === 1 ? "" : "s"}`;
  const blockingLabel = `Blocking ${blocking} issue${blocking === 1 ? "" : "s"}`;

  return (
    <div
      data-slot="issue-card"
      data-kind={kind}
      data-state={state}
      data-drag-state={dragState}
      tabIndex={tabIndex}
      className={cn(
        issueCardVariants({ dragState: dragState ?? "none" }),
        selected && "shadow-ring",
        className,
      )}
      {...props}
    >
      <div className="flex h-[18px] min-w-0 items-center gap-1.5 text-[12px] text-fg-3 tabular-nums">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={cn("truncate", parentTitle ? "max-w-3/5 shrink-0" : "min-w-0")}>
            {hiddenProperties.includes("repository") ? null : repo}
            {number != null ? `#${number}` : state === "draft" ? "Draft" : ""}
          </span>
          {parentTitle ? (
            <span
              className="min-w-0 truncate"
              title={parentTitle}
            >
              › {parentTitle}
            </span>
          ) : null}
        </div>
        {pending ? <span className="shrink-0 font-medium text-warning">Pending</span> : null}
        {!hiddenProperties.includes("assignees") ? (
          <span className="flex shrink-0 items-center">
            {assignees.length ? (
              <AvatarStack
                users={assignees}
                size={16}
              />
            ) : (
              <span
                role="img"
                aria-label="Unassigned"
                className="size-3.5 shrink-0 rounded-full opacity-60 shadow-[inset_0_0_0_1px_var(--pl-fg-3)]"
              />
            )}
          </span>
        ) : null}
      </div>
      <div className={cn("flex items-start gap-2 font-medium text-base", muted && "text-fg-3")}>
        <span className="mt-0.5 flex shrink-0 text-fg-3">
          {kind === "pr" ? (
            state === "draft" ? (
              <GitPullRequestDraft className="size-3.5" />
            ) : state === "merged" ? (
              <GitMerge className="size-3.5 text-status-done" />
            ) : state === "closed" ? (
              <GitPullRequestClosed className="size-3.5" />
            ) : (
              <GitPullRequest className="size-3.5" />
            )
          ) : (
            <StatusSquare status={resolvedStatus} />
          )}
        </span>
        <span className="min-w-0 text-pretty">{title}</span>
      </div>
      {priority || subIssues || blockedBy > 0 || blocking > 0 || pullRequestCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {priority ? (
            <span className="grid size-[22px] place-items-center rounded-md shadow-[inset_0_0_0_1px_var(--pl-border)]">
              <PriorityGlyph priority={priority} />
            </span>
          ) : null}
          {subIssues ? (
            <span
              className={metadataClass}
              role="img"
              aria-label={`${subIssues.completed} of ${subIssues.total} sub-issues completed`}
              title={`${subIssues.completed} of ${subIssues.total} sub-issues completed`}
            >
              <ProgressRing value={subIssues.total ? subIssues.completed / subIssues.total : 0} />
              {subIssues.completed}/{subIssues.total}
            </span>
          ) : null}
          {pullRequestCount > 0 ? (
            <span
              className={metadataClass}
              role="img"
              aria-label={prLabel}
              title={prLabel}
            >
              {pullRequest?.state === "merged" ? (
                <GitMerge className="size-3.5" />
              ) : pullRequest?.state === "closed" ? (
                <GitPullRequestClosed className="size-3.5" />
              ) : pullRequest?.is_draft ? (
                <GitPullRequestDraft className="size-3.5" />
              ) : (
                <GitPullRequest className="size-3.5" />
              )}
              {pullRequest ? `#${pullRequest.number}` : `${pullRequestCount} PRs`}
            </span>
          ) : null}
          {blockedBy > 0 ? (
            <span
              className={cn(metadataClass, "bg-danger-soft text-danger")}
              role="img"
              aria-label={blockedLabel}
              title={blockedLabel}
            >
              <CircleMinus className="size-3.5 fill-current [&_path]:stroke-card" />
              Blocked by {blockedBy}
            </span>
          ) : null}
          {blocking > 0 ? (
            <span
              className={metadataClass}
              role="img"
              aria-label={blockingLabel}
              title={blockingLabel}
            >
              <Hand className="size-3.5" />
              Blocks {blocking}
            </span>
          ) : null}
        </div>
      ) : null}
      {!hiddenProperties.includes("labels") ? <LabelSummary labels={labels} /> : null}
      {createdAt ? (
        <span className="text-[12px] text-fg-3 tabular-nums">
          Created{" "}
          {new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      ) : null}
      {updated ? (
        <div
          aria-hidden
          className="absolute top-2 right-2 size-2 rounded-full bg-accent"
        />
      ) : null}
      {dragState === "ghost" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg bg-bg opacity-70"
        />
      ) : null}
    </div>
  );
}

const metadataClass =
  "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-fg-3 text-sm tabular-nums shadow-[inset_0_0_0_1px_var(--pl-border)]";

export function CardPlaceholder({
  height,
  className,
  style,
  ...props
}: ComponentProps<"div"> & { height: number }) {
  return (
    <div
      aria-hidden
      data-slot="card-placeholder"
      style={{ height, ...style }}
      className={cn(
        "rounded-lg border-[1.5px] border-line-strong border-dashed bg-hover",
        className,
      )}
      {...props}
    />
  );
}

type DraftFieldProps = Omit<ComponentProps<"input">, "className"> & { className?: string };

/** The title field of a new draft, shaped like the card it becomes, with its keys under it. */
export function DraftField({ className, ...props }: DraftFieldProps) {
  return (
    <div
      data-slot="draft-field"
      className={cn(
        "flex flex-col gap-[5px] rounded-lg bg-surface px-[9px] py-2 shadow-[var(--pl-shadow-card),0_0_0_2px_var(--pl-focus)]",
        className,
      )}
    >
      <div className="flex items-start gap-[7px]">
        <span
          aria-hidden
          className="grid h-[17px] w-3.5 shrink-0 place-items-center text-fg-3"
        >
          <StatusGlyph status="draft" />
        </span>
        <input
          aria-label="Draft title"
          placeholder="Draft title"
          className="min-w-0 flex-1 bg-transparent font-medium text-base text-fg leading-[17px] outline-none placeholder:text-fg-3"
          {...props}
        />
      </div>
      <div className="flex h-[18px] items-center gap-1 pl-[21px] text-2xs text-fg-3">
        <Kbd size="sm">↵</Kbd>
        Create
        <Kbd
          size="sm"
          className="ml-1.5"
        >
          esc
        </Kbd>
        Cancel
      </div>
    </div>
  );
}
