import { expect, test } from "vitest";
import {
  boardField,
  board as boardFixture,
  boardProject,
  column,
} from "@/ipc/_fixtures/board.fixtures";
import { draft } from "@/ipc/_fixtures/card.fixtures";
import type { Intent, Placement } from "@/ipc/bindings.types";
import { inverse } from "@/undo/inverse";
import { dropPlacement, filterBoard, selectionAfterRemoval } from "./filter";
import { applyIntent } from "./moveCard";

const card = (item_id: string, position: number) =>
  draft({ id: item_id, item_id, position, title: item_id });
const board = boardFixture({
  project: boardProject({ id: "project", number: 1, title: "Project", url: "" }),
  field: boardField({ id: "status" }),
  columns: [
    column({
      cards: [
        card("leading", 0),
        card("alpha", 1),
        card("between", 2),
        card("beta", 3),
        card("tail", 4),
      ],
    }),
    column({ option_id: "done", name: "Done", cards: [card("moving", 5), card("other", 6)] }),
    column({ option_id: "empty", name: "Empty" }),
    column({ option_id: null, name: "No Status", cards: [card("unset", 7)] }),
  ],
});

test("status filtering preserves columns, server cards and canonical positions", () => {
  const filtered = filterBoard(board, ["done", null]);

  expect(filterBoard(board, [])).toBe(board);
  expect(filtered.columns.map((column) => column.cards.map((card) => card.item_id))).toEqual([
    [],
    ["moving", "other"],
    [],
    ["unset"],
  ]);
  expect(filtered.columns[1].cards).toBe(board.columns[1].cards);
  expect(board.columns[0].cards).toHaveLength(5);
  expect(filtered.columns[1].cards[0].position).toBe(5);
});

test.each<[string, string[], string, number, Placement]>([
  ["before first visible", ["alpha", "beta"], "moving", 0, { after: "leading" }],
  ["after visible predecessor", ["alpha", "beta"], "moving", 1, { after: "alpha" }],
  ["after last visible", ["alpha", "beta"], "moving", 2, { after: "beta" }],
  ["no visible neighbors", [], "moving", 0, { after: "tail" }],
  ["project beginning", ["leading", "alpha"], "moving", 0, "top"],
  ["within a column", ["alpha", "beta"], "beta", 0, { after: "leading" }],
])(
  "%s preserves hidden order and Undo restores the whole board",
  (_, visible, itemId, index, expected) => {
    const column = {
      ...board.columns[0],
      cards: board.columns[0].cards.filter((card) => visible.includes(card.item_id)),
    };
    const placement = dropPlacement(board, column, itemId, index);
    const intent: Intent = {
      type: "move_card",
      project_id: "project",
      field_id: "status",
      to: "todo",
      item_id: itemId,
      placement,
    };
    const undo = inverse(board, intent);

    const moved = applyIntent(board, intent);

    expect(placement).toEqual(expected);
    expect(
      moved.columns
        .flatMap((column) => column.cards)
        .sort((left, right) => left.position - right.position)
        .filter((card) => ["leading", "between", "tail"].includes(card.item_id))
        .map((card) => card.item_id),
    ).toEqual(["leading", "between", "tail"]);
    expect(undo).not.toBeNull();
    expect(undo && applyIntent(moved, undo)).toEqual(board);
  },
);

test("a truly empty group appends at the end of the project", () => {
  expect(dropPlacement(board, board.columns[2], "moving", 0)).toEqual({ after: "unset" });
});

test("selection falls forward, then backward, then back to the view", () => {
  const previous = ["a", "b", "c", "d"];

  expect(selectionAfterRemoval(previous, ["a", "c", "d"], "b")).toBe("c");
  expect(selectionAfterRemoval(previous, ["a"], "b")).toBe("a");
  expect(selectionAfterRemoval(previous, [], "b")).toBeNull();
  expect(selectionAfterRemoval(previous, ["new"], "b")).toBeNull();
  expect(selectionAfterRemoval(previous, ["a"], "unknown")).toBeNull();
});
