import { expect, test, vi } from "vitest";
import { board as boardFixture, column } from "@/ipc/_fixtures/board.fixtures";
import { draft, issue as issueFixture, redacted } from "@/ipc/_fixtures/card.fixtures";
import { user as userFixture } from "@/ipc/_fixtures/user.fixtures";
import {
  archive,
  createDraft,
  matchCards,
  moveTo,
  paletteCommands,
  toggleAssignee,
} from "./commands";

const board = boardFixture({
  columns: [
    column({ cards: [draft()] }),
    column({ option_id: "progress", name: "In Progress" }),
    column({ option_id: "done", name: "Done" }),
  ],
});
const card = board.columns[0].cards[0];
const user = userFixture({ login: "user" });

test("actions target the selected project, card and status field", () => {
  expect(moveTo(board, card, null)).toEqual({
    type: "move_card",
    project_id: board.project.id,
    item_id: card.item_id,
    field_id: board.field.id,
    to: null,
    placement: "keep",
  });
  expect(archive(board, card)).toEqual({
    type: "archive",
    project_id: board.project.id,
    item_id: card.item_id,
  });
  expect(createDraft(board, null, "Draft")).toEqual({
    type: "create_draft",
    project_id: board.project.id,
    item_id: expect.stringMatching(/^draft:/),
    field_id: board.field.id,
    column: null,
    title: "Draft",
  });
});

test("assignment toggles by user id and ignores redacted cards", () => {
  const issue = issueFixture();

  expect(toggleAssignee(board, issue, user)).toMatchObject({ add: [user], remove: [] });
  expect(
    toggleAssignee(board, { ...issue, assignees: [{ ...user, login: "old-name" }] }, user),
  ).toMatchObject({ add: [], remove: [user] });
  expect(toggleAssignee(board, redacted({ item_id: "hidden", position: 1 }), user)).toBeNull();
});

test("the palette wires status, card, project and layout actions without reopening the current project", () => {
  const actions = {
    move: vi.fn(),
    assign: vi.fn(),
    archive: vi.fn(),
    newIssue: vi.fn(),
    syncNow: vi.fn(),
    openProject: vi.fn(),
    signOut: vi.fn(),
    showBoard: vi.fn(),
    showList: vi.fn(),
  };
  const owners = [
    {
      login: "user",
      is_org: false,
      projects: [
        { id: board.project.id, number: 1, title: "Current", closed: false, url: "" },
        { id: "other", number: 2, title: "Other", closed: false, url: "" },
        { id: "closed", number: 3, title: "Closed", closed: true, url: "" },
      ],
    },
  ];
  const commands = paletteCommands(board, card, owners, actions);

  for (const command of commands) {
    command.run();
  }

  expect(actions.move.mock.calls).toEqual(
    board.columns.slice(1).map((column) => [column.option_id]),
  );
  expect(actions.openProject.mock.calls).toEqual([["other"]]);
  expect(actions.archive).toHaveBeenCalledOnce();
  expect(actions.showBoard).toHaveBeenCalledOnce();
  expect(actions.showList).toHaveBeenCalledOnce();

  const withoutSelection = paletteCommands(board, null, owners, actions);

  expect(withoutSelection.every((command) => command.group === "commands")).toBe(true);
});

test("search matches title, number and repository, skips redactions and limits results", () => {
  const issue = issueFixture({ title: "Show linked PRs", number: 226, repo: "planche/app" });
  const searchable = boardFixture({
    ...board,
    columns: [
      {
        ...board.columns[0],
        cards: [
          issue,
          { ...issue, item_id: "second" },
          redacted({ item_id: "hidden", position: 2 }),
        ],
      },
    ],
  });

  expect(matchCards(searchable, "LiNkEd PRs", 1)).toEqual([issue]);
  expect(matchCards(searchable, "app#226")).toHaveLength(2);
  expect(matchCards(searchable, "missing")).toEqual([]);
  expect(matchCards(searchable, "   ")).toEqual([]);
  expect(matchCards(null, "linked")).toEqual([]);
});
