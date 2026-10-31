import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";

export type DescriptionStatus =
  | "loading"
  | "refreshing"
  | "ready"
  | "offline"
  | "error"
  | "unavailable";

export function IssueDescriptionContent({
  body,
  status,
  message,
  onRetry,
  sourceUrl,
  onOpenLink,
}: {
  body?: string;
  status: DescriptionStatus;
  message?: string;
  onRetry: () => void;
  sourceUrl?: string;
  onOpenLink: (url: string) => void;
}) {
  const pending = status === "loading" || status === "refreshing";

  return (
    <section
      aria-label="Description"
      aria-busy={pending}
      className="mt-7 space-y-3"
    >
      <h2 className="font-medium">Description</h2>
      {status !== "ready" ? (
        <div className="flex flex-wrap items-center gap-2 text-fg-3 text-sm">
          <p role={status === "error" ? "alert" : "status"}>
            {status === "unavailable"
              ? "Description unavailable. Your access may have changed."
              : status === "loading"
                ? "Loading description…"
                : status === "refreshing"
                  ? "Saved description · Refreshing…"
                  : status === "offline"
                    ? body === undefined
                      ? "Description unavailable offline."
                      : "Saved description · Offline"
                    : body === undefined
                      ? "Could not load the description."
                      : "Saved description · Could not refresh"}
            {message ? ` ${message}` : ""}
          </p>
          {!pending ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRetry}
            >
              Retry description
            </Button>
          ) : null}
        </div>
      ) : null}
      {body !== undefined && status !== "unavailable" ? (
        <Markdown
          body={body || "No description provided."}
          sourceUrl={sourceUrl}
          onOpenLink={onOpenLink}
        />
      ) : null}
    </section>
  );
}
