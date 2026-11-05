import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { cardData } from "@/board/Card";
import { IssueActivity } from "@/board/IssueActivity";
import { IssueComments } from "@/board/IssueComments";
import { IssueDescription } from "@/board/IssueDescription";
import { useIssueLink } from "@/board/useIssueLink";
import { IssueDetail } from "@/components/ui/issue-detail";
import { notify } from "@/components/ui/toast";
import type { ItemContent } from "@/ipc/bindings.types";
import { cachedIssueQuery, errorMessage, issueQuery } from "@/ipc/queries";
import { useUi } from "@/stores/ui";

type RepositoryIssue = Extract<ItemContent, { kind: "issue" }>;

export function IssuePanel({
  account,
  content,
  summary,
  repository,
  offline,
  ...props
}: {
  account: string;
  content: string;
  summary: RepositoryIssue | null;
  repository: string;
  offline: boolean;
  active?: boolean;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenTab?: () => void;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const openIssueLink = useIssueLink(account);
  const cached = useQuery(cachedIssueQuery(account, content));
  const fresh = useQuery({ ...issueQuery(account, content), enabled: !offline });
  const record = fresh.data
    ? fresh.data.status === "unavailable"
      ? null
      : fresh.data.issue
    : cached.data;
  const unavailable = fresh.data?.status === "unavailable";
  const issue = unavailable ? null : record?.content.kind === "issue" ? record.content : summary;
  const openLink = (url: string) =>
    void openUrl(url).catch((error) => notify(errorMessage(error), "error"));

  return (
    <IssueDetail
      {...props}
      itemId={content}
      item={issue ? cardData(issue) : null}
      project={issue?.repo ?? repository}
      status={null}
      githubState={issue?.state}
      editable={Boolean(issue)}
      notice={
        unavailable
          ? "This issue is unavailable with your current GitHub access."
          : !issue
            ? "This issue is not in the local cache. Refresh when connected."
            : fresh.error
              ? `Showing saved issue. ${errorMessage(fresh.error)}`
              : undefined
      }
      onGitHub={issue ? () => openLink(issue.url) : undefined}
    >
      {issue && (
        <>
          <IssueDescription
            account={account}
            content={content}
            sourceUrl={issue.url}
            offline={offline}
          />
          <IssueActivity
            account={account}
            content={content}
            sourceUrl={issue.url}
            offline={offline}
            blockedBy={issue.details?.blocked_by}
            blocking={issue.details?.blocking}
          />
          <IssueComments
            account={account}
            content={content}
            sourceUrl={issue.url}
            offline={offline}
            onOpenLink={openIssueLink}
          />
        </>
      )}
    </IssueDetail>
  );
}

export function LinkedIssuePanel({ account, offline }: { account: string; offline: boolean }) {
  const linked = useUi((state) => state.linkedIssue);
  const [expanded, setExpanded] = useState(false);

  return linked ? (
    <IssuePanel
      key={linked.content}
      account={account}
      content={linked.content}
      summary={null}
      repository="Linked issue"
      offline={offline}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onBack={() => useUi.getState().setLinkedIssue(null)}
    />
  ) : null;
}
