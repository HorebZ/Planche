import {
  CircleMinus,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Hand,
} from "lucide-react";
import type { ClosingPullRequest } from "@/ipc/bindings.types";
import { cn } from "@/lib/cn";

export function IssueResources({
  blockedBy = 0,
  blocking = 0,
  pullRequests = [],
  onOpenLink,
}: {
  blockedBy?: number;
  blocking?: number;
  pullRequests?: ClosingPullRequest[];
  onOpenLink: (url: string) => void;
}) {
  if (!blockedBy && !blocking && !pullRequests.length) {
    return null;
  }

  return (
    <section
      aria-label="Resources"
      className="mt-7 space-y-4 border-line border-t pt-6"
    >
      <h2 className="font-medium">Resources</h2>
      <ul className="space-y-2 text-sm">
        {blockedBy > 0 ? (
          <li className="flex items-center gap-2 text-fg-2">
            <CircleMinus
              aria-hidden
              className="size-3.5 shrink-0 text-danger"
            />
            Blocked by {blockedBy} issue{blockedBy === 1 ? "" : "s"}
          </li>
        ) : null}
        {blocking > 0 ? (
          <li className="flex items-center gap-2 text-fg-2">
            <Hand
              aria-hidden
              className="size-3.5 shrink-0"
            />
            Blocking {blocking} issue{blocking === 1 ? "" : "s"}
          </li>
        ) : null}
        {pullRequests.map((pr) => {
          const state =
            pr.is_draft && pr.state === "open"
              ? "Draft"
              : { open: "Open", closed: "Closed", merged: "Merged" }[pr.state];
          const Icon =
            pr.state === "merged"
              ? GitMerge
              : pr.state === "closed"
                ? GitPullRequestClosed
                : pr.is_draft
                  ? GitPullRequestDraft
                  : GitPullRequest;

          return (
            <li
              key={pr.id}
              className="flex min-w-0 items-start gap-2"
            >
              <Icon
                role="img"
                aria-label={state}
                className={cn(
                  "mt-px size-3.5 shrink-0",
                  pr.state === "merged"
                    ? "text-accent"
                    : pr.state === "closed"
                      ? "text-danger"
                      : pr.is_draft
                        ? "text-fg-3"
                        : "text-success",
                )}
              />
              <a
                href={pr.url}
                className="min-w-0 break-words rounded-xs text-fg-2 underline underline-offset-2 focus-visible:shadow-ring"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenLink(pr.url);
                }}
              >
                {pr.repo}#{pr.number} · {pr.title}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
