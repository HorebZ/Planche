import type { Board, Card, Column, Intent } from "@/ipc/bindings";

/**
 * The board once GitHub has applied `intent`: the TypeScript twin of `intent::apply` in Rust,
 * held to the same `fixtures/move_cases.json`. Pure, and applying it twice changes nothing.
 */
export function moveCard(board: Board, intent: Intent): Board {
	const { project_id, item_id, field_id, to, placement } = intent;
	if (project_id !== board.project.id) return board;
	const from = board.columns.findIndex((c) => c.cards.some((card) => card.item_id === item_id));
	if (from < 0) return board;
	// Another field than the columns' leaves the card in its column.
	const option = field_id === board.field.id ? to : board.columns[from].option_id;
	if (option !== null && !board.columns.some((c) => c.option_id === option)) return board;

	const order = board.columns
		.flatMap((c) => c.cards)
		.sort((a, b) => a.position - b.position)
		.map((c) => c.item_id);
	const oldRank = order.indexOf(item_id);
	order.splice(oldRank, 1);
	let rank = oldRank;
	if (placement === "top") rank = 0;
	else if (typeof placement === "object") {
		const anchor = order.indexOf(placement.after);
		rank = anchor < 0 ? oldRank : anchor + 1;
	}
	order.splice(rank, 0, item_id);
	const ranks = new Map(order.map((id, i) => [id, i]));

	const card = board.columns[from].cards.find((c) => c.item_id === item_id) as Card;
	let columns: Column[] = board.columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.item_id !== item_id) }));
	let target = columns.findIndex((c) => c.option_id === option);
	if (target < 0) {
		columns = [{ option_id: null, name: `No ${board.field.name}`, color: null, cards: [] }, ...columns];
		target = 0;
	}
	columns[target].cards.push(card);
	columns = columns
		.map((c) => ({
			...c,
			cards: c.cards
				.map((x) => ({ ...x, position: ranks.get(x.item_id) as number }))
				.sort((a, b) => a.position - b.position),
		}))
		// The board shows "No <field>" only when it holds a card.
		.filter((c) => c.option_id !== null || c.cards.length > 0);
	return { ...board, columns };
}
