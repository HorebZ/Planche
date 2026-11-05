import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquare,
} from "lucide-react";
import { Fragment } from "react";
import { Avatar, type AvatarUser } from "@/components/ui/avatar";
import type { LinkedPullRequest } from "@/ipc/bindings.types";
import { cn } from "@/lib/cn";

const relativeTime = new Intl.RelativeTimeFormat("en", { style: "narrow", numeric: "auto" });

function age(milliseconds: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - milliseconds) / 60_000));

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return relativeTime.format(-minutes, "minute");
  }

  if (minutes < 1_440) {
    return relativeTime.format(-Math.floor(minutes / 60), "hour");
  }

  return relativeTime.format(-Math.floor(minutes / 1_440), "day");
}

export function IssueMetadata({
  author,
  createdAt,
  updatedAt,
  className,
}: {
  author?: AvatarUser;
  createdAt?: string;
  updatedAt?: string;
  className?: string;
}) {
  const dates = [
    { label: "Opened", value: createdAt },
    { label: "Updated", value: updatedAt },
  ].flatMap(({ label, value }) => {
    if (!value) {
      return [];
    }

    const milliseconds = Date.parse(value);

    return Number.isFinite(milliseconds) ? [{ label, value, milliseconds }] : [];
  });

  if (!author && !dates.length) {
    return null;
  }

  return (
    <span
      data-slot="issue-metadata"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-fg-3 text-xs",
        className,
      )}
    >
      {author ? (
        <span
          className="inline-flex min-w-0 items-center gap-1"
          title={`Created by ${author.login}`}
        >
          <Avatar
            src={author.avatarUrl}
            alt={author.login}
            size={16}
          />
          <span className="max-w-32 truncate">{author.login}</span>
        </span>
      ) : null}
      {dates.map(({ label, value, milliseconds }, index) => (
        <Fragment key={label}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          <time
            dateTime={value}
            title={`${label} ${new Date(milliseconds).toLocaleString()}`}
            className="shrink-0 whitespace-nowrap"
          >
            {label} {age(milliseconds)}
          </time>
        </Fragment>
      ))}
    </span>
  );
}

export function IssueCommentCount({ count }: { count?: number }) {
  if (count === undefined) {
    return null;
  }

  const label = `${count} comment${count === 1 ? "" : "s"}`;

  return (
    <span
      data-slot="issue-comment-count"
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center gap-1 text-fg-3 text-xs tabular-nums"
    >
      <MessageSquare
        aria-hidden
        className="size-3.5"
      />
      {count}
    </span>
  );
}

export function IssuePullRequestCount({
  count = 0,
  pullRequest,
  className,
}: {
  count?: number;
  pullRequest?: LinkedPullRequest;
  className?: string;
}) {
  if (count === 0) {
    return null;
  }

  // shortcut: only one linked PR has a cached state; load individual states if the list needs them.
  const pr = count === 1 ? pullRequest : undefined;
  const state = pr?.state === "open" && pr.is_draft ? "draft" : pr?.state;
  const Icon =
    state === "merged"
      ? GitMerge
      : state === "closed"
        ? GitPullRequestClosed
        : state === "draft"
          ? GitPullRequestDraft
          : GitPullRequest;
  const label = pr
    ? `Pull request #${pr.number}: ${pr.title} (${state})`
    : `${count} linked pull request${count === 1 ? "" : "s"}`;

  return (
    <span
      data-slot="issue-pr-count"
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-fg-3 text-xs tabular-nums",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-3.5",
          state === "open" && "text-success",
          state === "merged" && "text-status-review",
          state === "closed" && "text-danger",
        )}
      />
      {count}
    </span>
  );
}
