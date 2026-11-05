import { useQuery } from "@tanstack/react-query";
import { IssueActivityContent } from "@/components/ui/issue-activity";
import type { DescriptionStatus } from "@/components/ui/issue-description";
import { activityQuery, cachedActivityQuery, errorMessage } from "@/ipc/queries";
import { useIssueLink } from "./useIssueLink";

export function IssueActivity({
  account,
  content,
  offline,
  sourceUrl,
  blockedBy,
  blocking,
}: {
  account: string;
  content: string;
  offline: boolean;
  sourceUrl: string;
  blockedBy?: number;
  blocking?: number;
}) {
  const onOpenLink = useIssueLink(account);
  const cached = useQuery(cachedActivityQuery(account, content));
  const fresh = useQuery({ ...activityQuery(account, content), enabled: !offline });
  const activity = fresh.data !== undefined ? fresh.data : cached.data;
  const failure = fresh.error ?? (fresh.data === undefined ? cached.error : null);
  const networkError =
    failure && typeof failure === "object" && "kind" in failure && failure.kind === "Network";
  const status: DescriptionStatus =
    fresh.data === null
      ? "unavailable"
      : offline || networkError
        ? "offline"
        : fresh.isFetching
          ? activity
            ? "refreshing"
            : "loading"
          : failure
            ? "error"
            : activity
              ? "ready"
              : "loading";

  return (
    <IssueActivityContent
      activity={activity}
      status={status}
      message={failure && !networkError ? errorMessage(failure) : undefined}
      sourceUrl={sourceUrl}
      blockedBy={blockedBy}
      blocking={blocking}
      onRetry={() => void fresh.refetch()}
      onOpenLink={onOpenLink}
    />
  );
}
