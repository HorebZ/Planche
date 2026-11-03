import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IssueActivityContent } from "@/components/ui/issue-activity";
import type { DescriptionStatus } from "@/components/ui/issue-description";
import { notify } from "@/components/ui/toast";
import { activityQuery, cachedActivityQuery, errorMessage } from "@/ipc/queries";

export function IssueActivity({
  account,
  content,
  offline,
  sourceUrl,
}: {
  account: string;
  content: string;
  offline: boolean;
  sourceUrl: string;
}) {
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
      onRetry={() => void fresh.refetch()}
      onOpenLink={(url) =>
        void openUrl(url).catch((error) =>
          notify(`Could not open link: ${errorMessage(error)}`, "error"),
        )
      }
    />
  );
}
