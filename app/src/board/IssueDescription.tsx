import { useQuery } from "@tanstack/react-query";
import { type DescriptionStatus, IssueDescriptionContent } from "@/components/ui/issue-description";
import { cachedDescriptionQuery, descriptionQuery, errorMessage } from "@/ipc/queries";

export function IssueDescription({
  account,
  content,
  offline,
}: {
  account: string;
  content: string;
  offline: boolean;
}) {
  const cached = useQuery(cachedDescriptionQuery(account, content));
  const fresh = useQuery({ ...descriptionQuery(account, content), enabled: !offline });
  const description = fresh.data !== undefined ? fresh.data : cached.data;
  const failure = fresh.error ?? (fresh.data === undefined ? cached.error : null);
  const networkError =
    failure && typeof failure === "object" && "kind" in failure && failure.kind === "Network";
  const status: DescriptionStatus =
    fresh.data === null
      ? "unavailable"
      : offline || networkError
        ? "offline"
        : fresh.isFetching
          ? description
            ? "refreshing"
            : "loading"
          : failure
            ? "error"
            : description
              ? "ready"
              : "loading";

  return (
    <IssueDescriptionContent
      body={description?.body}
      status={status}
      message={failure && !networkError ? errorMessage(failure) : undefined}
      onRetry={() => void fresh.refetch()}
    />
  );
}
