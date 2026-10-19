import { useSortable } from "@dnd-kit/sortable";
import { memo, useLayoutEffect, useRef } from "react";
import { IssueCard, type IssueCardData } from "@/components/ui/issue-card";
import type { StatusKey } from "@/components/ui/status";
import type { Card as BoardCard } from "@/ipc/bindings";
import { useUi } from "@/stores/ui";

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
	/** The keyboard acts on this card, which then holds the focus. */
	selected?: boolean;
};

/** A card that drags and takes drops. The lifted copy lives in the board's DragOverlay. */
export const Card = memo(function Card({ card, status, ghost = false, selected = false }: CardProps) {
	const { setNodeRef, attributes, listeners } = useSortable({ id: card.item_id });
	const ref = useRef<HTMLDivElement | null>(null);
	// A selection made with the keyboard moves the focus here. An open overlay keeps it.
	useLayoutEffect(() => {
		if (selected && !useUi.getState().overlay && document.activeElement !== ref.current) ref.current?.focus();
	}, [selected]);
	return (
		<IssueCard
			{...cardData(card)}
			status={card.kind === "draft" ? "draft" : status}
			ref={(node) => {
				ref.current = node;
				setNodeRef(node);
			}}
			{...attributes}
			{...listeners}
			onFocus={() => {
				if (!selected) useUi.getState().select(card.item_id);
			}}
			data-item-id={card.item_id}
			aria-roledescription="card"
			dragState={ghost ? "ghost" : undefined}
			pending={card.pending}
			updated={card.updated_by_sync}
		/>
	);
});

export function cardElement(id: string) {
	return document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
}

/** Gives the focus back to a card after an overlay closes. */
export function focusCard(id: string) {
	cardElement(id)?.focus();
}
