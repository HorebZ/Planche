import type { Board, Card, Intent, ItemId, OptionId } from "@/ipc/bindings";

/**
 * The board once GitHub has applied `intent`: the TypeScript twin of `intent::apply` in Rust,
 * held to the same `fixtures/move_cases.json`. Pure, and applying it twice changes nothing.
 */
export function applyIntent(board: Board, intent: Intent): Board {
  if (intent.project_id !== board.project.id) {
    return board;
  }
  const from = board.columns.findIndex((c) =>
    c.cards.some((card) => card.item_id === intent.item_id),
  );
  switch (intent.type) {
    case "move_card": {
      if (from < 0) {
        return board;
      }
      const { item_id, field_id, to, placement } = intent;
      // Another field than the columns' leaves the card in its column.
      const option = field_id === board.field.id ? to : board.columns[from].option_id;
      if (option !== null && !board.columns.some((c) => c.option_id === option)) {
        return board;
      }
      const order = projectOrder(board);
      const oldRank = order.indexOf(item_id);
      const rest = order.filter((id) => id !== item_id);
      let rank = oldRank;
      if (placement === "top") {
        rank = 0;
      } else if (typeof placement === "object") {
        const anchor = rest.indexOf(placement.after);
        rank = anchor < 0 ? oldRank : anchor + 1;
      }
      const card = board.columns[from].cards.find((c) => c.item_id === item_id) as Card;
      return insert(without(board, item_id), card, option, rest, rank);
    }
    case "set_assignees": {
      const { add, remove } = intent;
      return mapCard(board, intent.item_id, (card) => {
        if (card.kind === "redacted") {
          return card;
        }
        const kept = card.assignees.filter((u) => !remove.some((r) => r.id === u.id));
        return {
          ...card,
          assignees: [...kept, ...add.filter((u) => !kept.some((k) => k.id === u.id))],
        };
      });
    }
    case "archive":
      if (from < 0) {
        return board;
      }
      return finish(
        without(board, intent.item_id),
        projectOrder(board).filter((id) => id !== intent.item_id),
      );
    case "unarchive":
      if (from >= 0) {
        return board;
      }
      return insert(board, intent.card, intent.column, projectOrder(board), intent.card.position);
    case "create_draft": {
      const { item_id, column, title } = intent;
      if (board.columns.some((c) => c.cards.some((x) => x.kind === "draft" && x.title === title))) {
        return board;
      }
      const card: Card = {
        item_id,
        position: 0,
        kind: "draft",
        id: "",
        title,
        assignees: [],
        pending: false,
        updated_by_sync: false,
      };
      return insert(board, card, column, projectOrder(board), 0);
    }
  }
}

/** The board's cards in project order. */
function projectOrder(board: Board): ItemId[] {
  return board.columns
    .flatMap((c) => c.cards)
    .sort((a, b) => a.position - b.position)
    .map((c) => c.item_id);
}

function without(board: Board, id: ItemId): Board {
  return {
    ...board,
    columns: board.columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.item_id !== id) })),
  };
}

function mapCard(board: Board, id: ItemId, f: (card: Card) => Card): Board {
  return {
    ...board,
    columns: board.columns.map((c) => ({
      ...c,
      cards: c.cards.map((x) => (x.item_id === id ? f(x) : x)),
    })),
  };
}

/** Puts `card` in the column of `option` at `rank` of `order`, which leaves the card out. */
function insert(
  board: Board,
  card: Card,
  option: OptionId | null,
  order: ItemId[],
  rank: number,
): Board {
  let columns = board.columns;
  let target = columns.findIndex((c) => c.option_id === option);
  if (target < 0 && option !== null) {
    return board;
  }
  if (target < 0) {
    columns = [
      { option_id: null, name: `No ${board.field.name}`, color: null, cards: [] },
      ...columns,
    ];
    target = 0;
  }
  columns = columns.map((c, i) => (i === target ? { ...c, cards: [...c.cards, card] } : c));
  const ranked = [...order];
  ranked.splice(Math.min(rank, ranked.length), 0, card.item_id);
  return finish({ ...board, columns }, ranked);
}

/** Ranks every card by `order`, and sorts each column by rank. */
function finish(board: Board, order: ItemId[]): Board {
  const ranks = new Map(order.map((id, i) => [id, i]));
  const columns = board.columns
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
