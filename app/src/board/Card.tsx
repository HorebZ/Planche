import { useSortable } from "@dnd-kit/sortable";
import { memo } from "react";
import { IssueCard, type IssueCardData } from "@/components/ui/issue-card";
import type { StatusKey } from "@/components/ui/status";
import type { Card as BoardCard } from "@/ipc/bindings";

/** The repository name without its owner, as the card shows it. */
function shortRepo(repo: string) {
	return repo.slice(repo.indexOf("/") + 1);
}

export function cardData(card: BoardCard): IssueCardData {
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
	card: BoardCard;
	status?: StatusKey;
	/** The card is lifted, and this is the spot it left. */
	ghost?: boolean;
};

/** A card that drags and takes drops. The lifted copy lives in the board's DragOverlay. */
export const Card = memo(function Card({ card, status, ghost = false }: CardProps) {
	const { setNodeRef, attributes, listeners } = useSortable({ id: card.item_id });
	return (
		<IssueCard
			{...cardData(card)}
			status={card.kind === "draft" ? "draft" : status}
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			data-item-id={card.item_id}
			aria-roledescription="card"
			dragState={ghost ? "ghost" : undefined}
			pending={card.pending}
			updated={card.updated_by_sync}
		/>
	);
});
