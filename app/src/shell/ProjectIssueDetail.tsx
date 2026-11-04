import { openUrl } from "@tauri-apps/plugin-opener";
import type { ComponentProps } from "react";
import { cardData } from "@/board/Card";
import { IssueActivity } from "@/board/IssueActivity";
import { IssueComments } from "@/board/IssueComments";
import { IssueDescription } from "@/board/IssueDescription";
import { statusTone } from "@/board/statusTone";
import { IssueDetail } from "@/components/ui/issue-detail";
import { notify } from "@/components/ui/toast";
import type { Board } from "@/ipc/bindings.types";
import { errorMessage } from "@/ipc/queries";

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
  contextNotice?: string;
};

export function ProjectIssueDetail({ board, account, offline, contextNotice, ...props }: Props) {
  const column = board?.columns.find((column) =>
    column.cards.some((card) => card.item_id === props.itemId),
  );
  const card = column?.cards.find((card) => card.item_id === props.itemId);
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
      onGitHub={
        card && card.kind !== "redacted" && board
          ? () => void openUrl("url" in card ? card.url : board.project.url)
          : undefined
      }
    >
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
          />
          <IssueComments
            account={account}
            content={card.id}
            sourceUrl={card.url}
            offline={offline}
            onOpenLink={(url) =>
              void openUrl(url).catch((error) =>
                notify(`Could not open link: ${errorMessage(error)}`, "error"),
              )
            }
          />
        </div>
      ) : null}
    </IssueDetail>
  );
}
