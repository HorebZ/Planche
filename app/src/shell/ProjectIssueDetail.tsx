import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type ComponentProps, useState } from "react";
import { cardData } from "@/board/Card";
import { IssueActivity } from "@/board/IssueActivity";
import { IssueComments } from "@/board/IssueComments";
import { IssueDescription } from "@/board/IssueDescription";
import { statusTone } from "@/board/statusTone";
import { useActions } from "@/board/useActions";
import { useIssueLink } from "@/board/useIssueLink";
import { IssueDescriptionContent, IssueDescriptionEditor } from "@/components/ui/issue-description";
import { IssueDetail } from "@/components/ui/issue-detail";
import { notify } from "@/components/ui/toast";
import { type Board, commands, type ViewId } from "@/ipc/bindings.types";
import { errorMessage, projectQuery } from "@/ipc/queries";

type Props = Pick<
  ComponentProps<typeof IssueDetail>,
  | "itemId"
  | "expanded"
  | "active"
  | "onExpandedChange"
  | "onOpenTab"
  | "onBack"
  | "onPrevious"
  | "onNext"
  | "onStatus"
  | "onAssign"
> & {
  board: Board | null;
  account: string | null;
  offline: boolean;
  viewId?: ViewId | null;
  contextNotice?: string;
};

export function ProjectIssueDetail(props: Props) {
  return (
    <ProjectDetail
      key={`${props.account}:${props.itemId}`}
      {...props}
    />
  );
}

function ProjectDetail({ board, account, offline, viewId = null, contextNotice, ...props }: Props) {
  const project = useQuery({ ...projectQuery(board?.project.id ?? ""), enabled: Boolean(board) });
  const actions = useActions(board?.project.id ?? "", viewId);
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onOpenLink = useIssueLink(account ?? "");
  const column = board?.columns.find((column) =>
    column.cards.some((card) => card.item_id === props.itemId),
  );
  const card = column?.cards.find((card) => card.item_id === props.itemId);
  const canEditDraft = Boolean(
    account &&
      project.data?.can_update &&
      card?.kind === "draft" &&
      card.id &&
      typeof card.body === "string" &&
      !card.pending,
  );
  const editDraft =
    canEditDraft && card?.kind === "draft"
      ? () => {
          setDraft({ title: card.title, body: card.body ?? "" });
          setError(null);
        }
      : undefined;
  const saveDraft = async () => {
    if (!draft || !board || !card || !canEditDraft || saving || !draft.title.trim()) {
      return;
    }

    setSaving(true);
    setError(null);

    const result = await actions.run({
      type: "update_draft",
      project_id: board.project.id,
      item_id: card.item_id,
      title: draft.title.trim(),
      body: draft.body,
    });

    setSaving(false);

    if (result.type === "accepted") {
      setDraft(null);
    } else {
      setError(result.type === "rejected" ? result.error.message : result.message);
    }
  };
  const notice = !board
    ? "This project is not available in the local cache. Sync, then try again."
    : !card
      ? "This item is no longer in the project. Return to the visible collection."
      : card.kind === "redacted"
        ? "This item's content is unavailable with your current access."
        : card.kind === "draft"
          ? "This is a project draft. It has no GitHub issue page yet."
          : card.kind === "pull_request"
            ? "Read this pull request's description and activity on GitHub."
            : undefined;

  return (
    <IssueDetail
      {...props}
      item={card ? cardData(card) : null}
      project={board?.project.title ?? "Project unavailable"}
      status={column ? { name: column.name, tone: statusTone(column.color, column.name) } : null}
      notice={[contextNotice, notice].filter(Boolean).join(" ") || undefined}
      editable={Boolean(card && card.kind !== "redacted")}
      onEditTitle={draft || saving ? undefined : editDraft}
      onGitHub={
        card && card.kind !== "redacted" && board
          ? () => void openUrl("url" in card ? card.url : board.project.url)
          : undefined
      }
    >
      {card?.kind === "draft" ? (
        draft ? (
          <IssueDescriptionEditor
            title={draft.title}
            onTitleChange={(title) => setDraft({ ...draft, title })}
            value={draft.body}
            onChange={(body) => setDraft({ ...draft, body })}
            onSave={() => void saveDraft()}
            onCancel={() => {
              setDraft(null);
              setError(null);
            }}
            saving={saving}
            error={error}
            sourceUrl={board?.project.url}
            onOpenLink={onOpenLink}
          />
        ) : (
          <IssueDescriptionContent
            body={card.body ?? undefined}
            status={offline ? "offline" : card.body == null ? "error" : "ready"}
            message={
              card.body == null ? "Sync the project to load this draft's description." : undefined
            }
            onRetry={() => {
              if (board) {
                void commands
                  .refreshProject(board.project.id)
                  .catch((error) => notify(errorMessage(error), "error"));
              }
            }}
            pending={card.pending}
            syncError={card.edit_error}
            onEdit={editDraft}
            sourceUrl={board?.project.url}
            onOpenLink={onOpenLink}
          />
        )
      ) : null}
      {card?.kind === "issue" && account ? (
        <div key={`${account}:${card.id}`}>
          <IssueDescription
            account={account}
            content={card.id}
            sourceUrl={card.url}
            offline={offline}
          />
          <IssueActivity
            account={account}
            content={card.id}
            sourceUrl={card.url}
            offline={offline}
            blockedBy={card.details?.blocked_by}
            blocking={card.details?.blocking}
          />
          <IssueComments
            account={account}
            content={card.id}
            sourceUrl={card.url}
            offline={offline}
            onOpenLink={onOpenLink}
          />
        </div>
      ) : null}
    </IssueDetail>
  );
}
