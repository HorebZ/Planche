import { cva, type VariantProps } from "class-variance-authority";
import { GitMerge, GitPullRequest, GitPullRequestDraft } from "lucide-react";
import type { ComponentProps } from "react";
import { AvatarStack, type AvatarUser } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { type CardLabel, LabelChip } from "@/components/ui/label-chip";
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
};
export type IssueCardData = CardBase &
  (
    | { kind: "issue"; state: "open" | "closed" | "draft" }
    | { kind: "pr"; state: "open" | "closed" | "merged" | "draft" }
  );
export type IssueCardProps = IssueCardData & {
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
  selected = false,
  updated = false,
  pending = false,
  dragState,
  className,
  tabIndex = 0,
  ...props
}: IssueCardProps) {
  const resolvedStatus =
    status ??
    (state === "draft" ? "draft" : state === "closed" || state === "merged" ? "done" : "todo");
  const muted = resolvedStatus === "done" || resolvedStatus === "cancelled";
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
      <div className="flex h-[18px] items-center gap-1.5 text-[12px] text-fg-3 tabular-nums">
        <span className="shrink-0">
          {repo}
          {number != null ? `#${number}` : state === "draft" ? "Draft" : ""}
        </span>
        {parentTitle ? <span className="truncate">› {parentTitle}</span> : null}
        {pending ? <span className="font-medium text-warning">Pending</span> : null}
        <span className="flex-1" />
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
      </div>
      <div className={cn("flex items-start gap-2 font-medium text-base", muted && "text-fg-3")}>
        <span className="mt-0.5 flex shrink-0 text-fg-3">
          {kind === "pr" ? (
            state === "draft" ? (
              <GitPullRequestDraft className="size-3.5" />
            ) : state === "merged" ? (
              <GitMerge className="size-3.5 text-status-done" />
            ) : (
              <GitPullRequest className="size-3.5" />
            )
          ) : (
            <StatusSquare status={resolvedStatus} />
          )}
        </span>
        <span className="min-w-0 text-pretty">{title}</span>
      </div>
      {priority || labels.length || subIssues ? (
        <div className="flex flex-wrap items-center gap-1">
          {priority ? (
            <span className="grid size-[22px] place-items-center rounded-md shadow-[inset_0_0_0_1px_var(--pl-border)]">
              <PriorityGlyph priority={priority} />
            </span>
          ) : null}
          {subIssues ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-fg-3 text-sm tabular-nums shadow-[inset_0_0_0_1px_var(--pl-border)]">
              <ProgressRing value={subIssues.total ? subIssues.completed / subIssues.total : 0} />
              {subIssues.completed}/{subIssues.total}
            </span>
          ) : null}
          {labels.map((label) => (
            <LabelChip
              key={`${label.name}-${label.color}`}
              {...label}
            />
          ))}
        </div>
      ) : null}
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
