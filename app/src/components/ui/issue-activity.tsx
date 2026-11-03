import { Button } from "@/components/ui/button";
import type { DescriptionStatus } from "@/components/ui/issue-description";
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
  onRetry,
  onOpenLink,
}: {
  activity?: IssueActivity | null;
  status: DescriptionStatus;
  message?: string;
  sourceUrl?: string;
  onRetry: () => void;
  onOpenLink: (url: string) => void;
}) {
  const pending = status === "loading" || status === "refreshing";
  const visible = status !== "unavailable" ? activity : null;

  return (
    <section
      aria-label="Activity"
      aria-busy={pending}
      className="mt-7 space-y-4"
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
                  className="min-w-0 space-y-2 border-line border-l pl-3"
                >
                  <p className="flex flex-wrap gap-x-1 text-fg-3 text-sm">
                    <span className="font-medium text-fg-2">{entry.author ?? "Deleted user"}</span>
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
          <h3 className="font-medium">Closing pull requests</h3>
          {visible.pull_requests.length ? (
            <ul className="space-y-2">
              {visible.pull_requests.map((pr) => (
                <li
                  key={pr.id}
                  className="min-w-0"
                >
                  <a
                    href={pr.url}
                    tabIndex={0}
                    className="rounded-xs text-fg-2 underline underline-offset-2 focus-visible:shadow-ring"
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenLink(pr.url);
                    }}
                  >
                    {pr.repo}#{pr.number} · {pr.title}
                  </a>
                  <span className="ml-2 text-fg-3 text-sm">
                    {pr.is_draft && pr.state === "open"
                      ? "Draft"
                      : { open: "Open", closed: "Closed", merged: "Merged" }[pr.state]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-3 text-sm">No closing pull requests.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
