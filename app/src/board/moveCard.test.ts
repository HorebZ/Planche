import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Board, Intent } from "@/ipc/bindings";
import { applyIntent } from "./moveCard";

type MoveCase = { name: string; board: Board; intent: Intent; expected: Board };

const cases: MoveCase[] = JSON.parse(
	readFileSync(new URL("../../../fixtures/move_cases.json", import.meta.url), "utf8"),
);

test("the fixture has cases", () => {
	expect(cases.length).toBeGreaterThanOrEqual(10);
});

test.each(cases.map((c) => [c.name, c] as const))("%s", (_, { board, intent, expected }) => {
	const once = applyIntent(board, intent);
	expect(once).toEqual(expected);
	expect(applyIntent(once, intent)).toEqual(expected);
});
