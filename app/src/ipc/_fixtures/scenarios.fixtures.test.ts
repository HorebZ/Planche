import { expect, test } from "vitest";
import { boardFor, mockupBoard } from "./scenarios.fixtures";

test("board scenarios have fresh cards and restart their canonical positions", () => {
  const first = mockupBoard();
  const second = mockupBoard();

  first.columns[0].cards[0].pending = true;
  first.project.title = "Changed";

  expect(second.project.title).toBe("Planche — v1.2");
  expect(second.columns[0].cards[0].pending).toBe(false);
  expect(second.columns.flatMap((column) => column.cards).map((card) => card.position)).toEqual(
    Array.from({ length: 17 }, (_, index) => index),
  );
});

test("the large board has one thousand distinct cards in canonical position order", () => {
  const cards = boardFor("big")?.columns.flatMap((column) => column.cards) ?? [];

  expect(cards).toHaveLength(1000);
  expect(new Set(cards.map((card) => card.item_id)).size).toBe(1000);
  expect(cards.map((card) => card.position)).toEqual(
    Array.from({ length: 1000 }, (_, index) => index),
  );
  expect(boardFor("loading")).toBeNull();
});
