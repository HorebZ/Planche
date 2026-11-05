import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  type DescriptionStatus,
  IssueDescriptionContent,
  IssueDescriptionEditor,
} from "@/components/ui/issue-description";
import { commands } from "@/ipc/bindings.types";
import {
  boardAccountEpoch,
  cachedDescriptionQuery,
  cachedIssueQuery,
  descriptionQuery,
  errorMessage,
} from "@/ipc/queries";
import { useIssueLink } from "./useIssueLink";

type Props = {
  account: string;
  content: string;
  offline: boolean;
  sourceUrl?: string;
};

export function IssueDescription(props: Props) {
  return (
    <Description
      key={`${props.account}:${props.content}`}
      {...props}
    />
  );
}

function Description({ account, content, offline, sourceUrl }: Props) {
  const client = useQueryClient();
  const cached = useQuery(cachedDescriptionQuery(account, content));
  const fresh = useQuery({ ...descriptionQuery(account, content), enabled: !offline });
  const issue = useQuery(cachedIssueQuery(account, content));
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const onOpenLink = useIssueLink(account);
  const permitted = Boolean(issue.data?.permissions?.update) && status !== "unavailable";
  const save = async () => {
    if (draft === null || saving || !permitted) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    const epoch = boardAccountEpoch(client);

    try {
      const outcome = await commands.dispatchIssueIntent(account, {
        type: "update_body",
        content_id: content,
        body: draft,
      });

      if (boardAccountEpoch(client) !== epoch) {
        return;
      }

      if (outcome.type === "rejected") {
        setSaveError(outcome.error.message);
        return;
      }

      await client.cancelQueries({
        queryKey: ["issue-description", "github.com", account, content],
      });
      const saved = await client.fetchQuery({
        ...cachedDescriptionQuery(account, content),
        staleTime: 0,
      });

      if (boardAccountEpoch(client) !== epoch) {
        return;
      }

      client.setQueryData(descriptionQuery(account, content).queryKey, saved);
      setDraft(null);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return draft !== null && permitted ? (
    <IssueDescriptionEditor
      value={draft}
      onChange={setDraft}
      onSave={() => void save()}
      onCancel={() => {
        setDraft(null);
        setSaveError(null);
      }}
      saving={saving}
      error={saveError}
      sourceUrl={sourceUrl}
      onOpenLink={onOpenLink}
    />
  ) : (
    <IssueDescriptionContent
      body={description?.body}
      status={status}
      message={failure && !networkError ? errorMessage(failure) : undefined}
      onRetry={() => void fresh.refetch()}
      sourceUrl={sourceUrl}
      pending={description?.pending}
      syncError={description?.error}
      onEdit={permitted ? () => setDraft(description?.body ?? "") : undefined}
      onOpenLink={onOpenLink}
    />
  );
}
