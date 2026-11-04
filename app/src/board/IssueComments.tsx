import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CommentComposer } from "@/components/ui/comment-composer";
import { type CommentSubmission, commands } from "@/ipc/bindings.types";
import { cachedIssueQuery, commentsQuery, errorMessage, issueQuery } from "@/ipc/queries";
import { commentKey, emptyComment, useCommentDrafts } from "@/stores/comment-drafts";

export function IssueComments({
  account,
  content,
  offline,
  sourceUrl,
  onOpenLink,
}: {
  account: string;
  content: string;
  offline: boolean;
  sourceUrl: string;
  onOpenLink: (url: string) => void;
}) {
  const client = useQueryClient();
  const key = commentKey(account, content);
  const draft = useCommentDrafts((state) => state.entries[key] ?? emptyComment);
  const cached = useQuery(cachedIssueQuery(account, content));
  const fresh = useQuery({ ...issueQuery(account, content), enabled: !offline });
  const submissions = useQuery(commentsQuery(account, content));
  const issue = fresh.data
    ? fresh.data.status === "unavailable"
      ? null
      : fresh.data.issue
    : cached.data;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const refresh = () =>
    void client.invalidateQueries({ queryKey: commentsQuery(account, content).queryKey });

  const submit = () => {
    if (!issue?.permissions?.comment) {
      return;
    }

    const ticket = useCommentDrafts.getState().begin(key);

    if (!ticket) {
      return;
    }

    const timer = setTimeout(
      () =>
        useCommentDrafts
          .getState()
          .finish(
            ticket,
            false,
            "Could not confirm saving. Retry keeps the same request to avoid duplicates.",
          ),
      15_000,
    );
    void commands
      .dispatchIssueIntent(account, {
        type: "add_comment",
        content_id: content,
        request_id: ticket.request,
        body: ticket.body,
      })
      .then(
        (outcome) => {
          clearTimeout(timer);
          useCommentDrafts
            .getState()
            .finish(
              ticket,
              outcome.type === "accepted",
              outcome.type === "rejected" ? outcome.error.message : undefined,
            );
          refresh();
        },
        (error: unknown) => {
          clearTimeout(timer);
          useCommentDrafts.getState().finish(ticket, false, errorMessage(error));
          refresh();
        },
      );
  };
  const retry = (comment: CommentSubmission) => {
    if (retrying || !issue?.permissions?.comment) {
      return;
    }

    setRetrying(true);
    setRetryError(null);
    void commands
      .dispatchIssueIntent(account, {
        type: "add_comment",
        content_id: content,
        request_id: comment.request_id,
        body: comment.body,
      })
      .then(
        (outcome) => {
          if (outcome.type === "rejected") {
            setRetryError(outcome.error.message);
          }
        },
        (error: unknown) => setRetryError(errorMessage(error)),
      )
      .finally(() => {
        setRetrying(false);
        refresh();
      });
  };

  return (
    <CommentComposer
      value={draft.body}
      onChange={(body) => useCommentDrafts.getState().edit(key, body)}
      onSubmit={submit}
      permitted={Boolean(issue?.permissions?.comment)}
      submitting={draft.saving || retrying}
      error={
        draft.error ??
        retryError ??
        (submissions.error ? errorMessage(submissions.error) : undefined)
      }
      submissions={submissions.data}
      onRetry={retry}
      sourceUrl={sourceUrl}
      onOpenLink={onOpenLink}
    />
  );
}
