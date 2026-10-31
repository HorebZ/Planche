import type { Board, Column, ItemId, OptionId, Placement } from "@/ipc/bindings.types";

export function filterBoard(board: Board, statuses: (OptionId | null)[]): Board {
  if (!statuses.length) {
    return board;
  }

  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: statuses.includes(column.option_id) ? column.cards : [],
    })),
  };
}

export function dropPlacement(
  board: Board,
  column: Column,
  itemId: ItemId,
  index: number,
): Placement {
  const visible = column.cards.filter((card) => card.item_id !== itemId);
  const before = visible[index - 1];

  if (before) {
    return { after: before.item_id };
  }

  const order = board.columns
    .flatMap((column) => column.cards)
    .filter((card) => card.item_id !== itemId)
    .sort((left, right) => left.position - right.position);
  const first = visible[0];
  // POSITION is global: the predecessor can belong to a hidden column.
  const previous = first
    ? order[order.findIndex((card) => card.item_id === first.item_id) - 1]
    : (board.columns
        .find((target) => target.option_id === column.option_id)
        ?.cards.filter((card) => card.item_id !== itemId)
        .at(-1) ?? order.at(-1));

  return previous ? { after: previous.item_id } : "top";
}

export function selectionAfterRemoval(
  previous: ItemId[],
  current: ItemId[],
  selected: ItemId,
): ItemId | null {
  const visible = new Set(current);
  const index = previous.indexOf(selected);

  if (index < 0) {
    return null;
  }

  return (
    previous.slice(index + 1).find((id) => visible.has(id)) ??
    previous
      .slice(0, index)
      .reverse()
      .find((id) => visible.has(id)) ??
    null
  );
}
