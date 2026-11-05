import { useSortable } from "@dnd-kit/sortable";
import { memo, useLayoutEffect, useRef } from "react";
import type { DisplayProperty } from "@/components/ui/display-menu";
import { IssueCard, type IssueCardData } from "@/components/ui/issue-card";
import type { StatusKey } from "@/components/ui/status";
import type { Card as BoardCard, ItemContent } from "@/ipc/bindings.types";
import { commandFor } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";

/** The repository name without its owner, as the card shows it. */
function shortRepo(repo: string) {
  return repo.slice(repo.indexOf("/") + 1);
}

export function cardData(card: ItemContent): IssueCardData {
  switch (card.kind) {
    case "issue":
      return {
        kind: "issue",
        state: card.state,
        repo: shortRepo(card.repo),
        number: card.number,
        title: card.title,
        labels: card.labels,
        assignees: card.assignees.map((u) => ({ login: u.login, avatarUrl: u.avatar_url })),
        createdAt: card.details?.created_at ?? undefined,
        updatedAt: card.details?.updated_at ?? undefined,
        author: card.details?.author
          ? { login: card.details.author.login, avatarUrl: card.details.author.avatar_url }
          : undefined,
        commentCount: card.details?.comment_count ?? undefined,
        parentTitle: card.details?.parent_title ?? undefined,
        subIssues: card.details?.sub_issues ?? undefined,
        blockedBy: card.details?.blocked_by,
        blocking: card.details?.blocking,
        pullRequestCount: card.details?.pull_request_count,
        pullRequest: card.details?.pull_request ?? undefined,
      };
    case "pull_request":
      return {
        kind: "pr",
        state: card.state === "open" && card.is_draft ? "draft" : card.state,
        repo: shortRepo(card.repo),
        number: card.number,
        title: card.title,
        labels: card.labels,
        assignees: card.assignees.map((u) => ({ login: u.login, avatarUrl: u.avatar_url })),
        createdAt: card.details?.created_at ?? undefined,
        updatedAt: card.details?.updated_at ?? undefined,
        author: card.details?.author
          ? { login: card.details.author.login, avatarUrl: card.details.author.avatar_url }
          : undefined,
        commentCount: card.details?.comment_count ?? undefined,
      };
    case "draft":
      return {
        kind: "issue",
        state: "draft",
        title: card.title,
        labels: [],
        assignees: card.assignees.map((u) => ({ login: u.login, avatarUrl: u.avatar_url })),
      };
    case "redacted":
      return { kind: "issue", state: "draft", title: "Redacted item", labels: [], assignees: [] };
  }
}

type CardProps = {
  readOnly?: boolean;
  hiddenProperties?: DisplayProperty[];
  card: BoardCard;
  status?: StatusKey;
  /** The card is lifted, and this is the spot it left. */
  ghost?: boolean;
  /** The keyboard acts on this card, which then holds the focus. */
  selected?: boolean;
};

/** A card that drags and takes drops. The lifted copy lives in the board's DragOverlay. */
export const Card = memo(function Card({
  card,
  status,
  ghost = false,
  selected = false,
  hiddenProperties,
  readOnly = false,
}: CardProps) {
  const detailing = useUi((state) => state.detailId !== null || state.activeIssueTab !== null);
  const { setNodeRef, attributes, listeners } = useSortable({
    id: card.item_id,
    disabled: readOnly,
  });
  const ref = useRef<HTMLDivElement | null>(null);

  // The column reveals selections; focusing a remounted row must not scroll it again.
  useLayoutEffect(() => {
    if (
      selected &&
      !detailing &&
      !document.activeElement?.closest('[role="tablist"]') &&
      !useUi.getState().overlay &&
      !ref.current?.contains(document.activeElement)
    ) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [selected, detailing]);

  return (
    <IssueCard
      {...cardData(card)}
      hiddenProperties={hiddenProperties}
      status={card.kind === "draft" ? "draft" : status}
      ref={(node) => {
        ref.current = node;
        setNodeRef(node);
      }}
      {...attributes}
      {...listeners}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);

        if (
          !event.defaultPrevented &&
          detailing &&
          event.target === event.currentTarget &&
          commandFor(event.nativeEvent, "board") === "card.open"
        ) {
          event.preventDefault();
          useUi.getState().openDetail(card.item_id);
        }
      }}
      onClick={(event) => {
        if (!event.defaultPrevented && !(event.target as HTMLElement).closest("button, a")) {
          useUi.getState().openDetail(card.item_id);
        }
      }}
      onFocus={() => {
        useUi.getState().finishReveal(card.item_id);

        if (!selected && !detailing) {
          useUi.getState().select(card.item_id);
        }
      }}
      data-item-id={card.item_id}
      aria-roledescription="card"
      dragState={ghost ? "ghost" : undefined}
      updated={card.updated_by_sync}
    />
  );
});

export function cardElement(id: string) {
  const selector = `[data-item-id="${CSS.escape(id)}"]`;

  return (
    document.querySelector<HTMLElement>(
      `[data-slot="issue-detail"][data-active="true"] ${selector}`,
    ) ?? document.querySelector<HTMLElement>(selector)
  );
}

/** Gives the focus back to a card after an overlay closes. */
export function focusCard(id: string) {
  const element = cardElement(id);

  element?.focus();

  if (element?.contains(document.activeElement)) {
    useUi.getState().finishReveal(id);
  }
}
