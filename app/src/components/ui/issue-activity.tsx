import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { DescriptionStatus } from "@/components/ui/issue-description";
import { IssueResources } from "@/components/ui/issue-resources";
import { Markdown } from "@/components/ui/markdown";
import type { ActivityEntry, IssueActivity } from "@/ipc/bindings.types";

function eventText(entry: ActivityEntry) {
  switch (entry.kind) {
    case "comment":
      return "commented";
    case "comment_deleted":
      return "deleted a comment";
    case "closed":
      return "closed this issue";
    case "reopened":
      return "reopened this issue";
    case "assigned":
      return `assigned ${entry.subject ?? "a deleted user"}`;
    case "unassigned":
      return `unassigned ${entry.subject ?? "a deleted user"}`;
    case "labeled":
      return `added label ${entry.subject ?? "(deleted)"}`;
    case "unlabeled":
      return `removed label ${entry.subject ?? "(deleted)"}`;
  }
}

export function IssueActivityContent({
  activity,
  status,
  message,
  sourceUrl,
  blockedBy,
  blocking,
  onRetry,
  onOpenLink,
}: {
  activity?: IssueActivity | null;
  status: DescriptionStatus;
  message?: string;
  sourceUrl?: string;
  blockedBy?: number;
  blocking?: number;
  onRetry: () => void;
  onOpenLink: (url: string) => void;
}) {
  const pending = status === "loading" || status === "refreshing";
  const visible = status !== "unavailable" ? activity : null;

  return (
    <>
      {status !== "unavailable" ? (
        <IssueResources
          blockedBy={blockedBy}
          blocking={blocking}
          pullRequests={visible?.pull_requests}
          onOpenLink={onOpenLink}
        />
      ) : null}
      <section
        aria-label="Activity"
        aria-busy={pending}
        className="mt-7 space-y-4 border-line border-t pt-6"
      >
        <h2 className="font-medium">Activity</h2>
        {status !== "ready" ? (
          <div className="flex flex-wrap items-center gap-2 text-fg-3 text-sm">
            <p role={status === "error" ? "alert" : "status"}>
              {status === "unavailable"
                ? "Activity unavailable. Your access may have changed."
                : status === "loading"
                  ? "Loading activity…"
                  : status === "refreshing"
                    ? "Saved activity · Refreshing…"
                    : status === "offline"
                      ? visible
                        ? "Saved activity · Offline"
                        : "Activity unavailable offline."
                      : visible
                        ? "Saved activity · Could not refresh"
                        : "Could not load activity."}
              {message ? ` ${message}` : ""}
            </p>
            {!pending ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onRetry}
              >
                Retry activity
              </Button>
            ) : null}
          </div>
        ) : null}
        {visible ? (
          <>
            <p className="text-fg-3 text-sm">
              Updated{" "}
              <time dateTime={visible.fetched_at}>
                {new Date(visible.fetched_at).toLocaleString()}
              </time>
            </p>
            {visible.entries.length ? (
              <ol className="space-y-4">
                {visible.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="min-w-0 space-y-2"
                  >
                    <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-fg-3 text-sm">
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fg-2">
                        <Avatar
                          src={
                            entry.author
                              ? `https://github.com/${encodeURIComponent(entry.author)}.png?size=32`
                              : undefined
                          }
                          alt={entry.author ?? "Deleted user"}
                          size={16}
                          aria-hidden
                        />
                        <span className="break-all">{entry.author ?? "Deleted user"}</span>
                      </span>
                      <span>{eventText(entry)}</span>
                      <time dateTime={entry.created_at}>
                        {new Date(entry.created_at).toLocaleString()}
                      </time>
                    </p>
                    {entry.kind === "comment" ? (
                      <Markdown
                        body={entry.body?.trim() ? entry.body : "Comment text unavailable."}
                        sourceUrl={sourceUrl}
                        onOpenLink={onOpenLink}
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-fg-3 text-sm">No activity yet.</p>
            )}
          </>
        ) : null}
      </section>
    </>
  );
}
