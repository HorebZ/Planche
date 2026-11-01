import type { Board, Card, Column, ProjectList, SyncStatus } from "../bindings.types";
import { board as boardFixture, column as columnFixture } from "./board.fixtures";
import { issue, pullRequest } from "./card.fixtures";
import { authStatus, user } from "./user.fixtures";

export type Scenario =
  | "labels"
  | "markdown"
  | "description-error"
  | "description-denied"
  | "description-loading"
  | "relations"
  | "board"
  | "locked"
  | "unlock-cancelled"
  | "six-statuses"
  | "loading"
  | "syncing"
  | "empty"
  | "offline"
  | "board-error"
  | "sync-error"
  | "refresh-error"
  | "rate-limited"
  | "uncached-sync-error"
  | "onboarding"
  | "oauth-waiting"
  | "oauth-denied"
  | "oauth-copy-error"
  | "checking"
  | "valid"
  | "invalid"
  | "projects-empty"
  | "projects-error"
  | "projects-sso"
  | "projects-partial-sso"
  | "valid-projects-error"
  | "big"
  | "rollback"
  | "sorted";

export const PROJECT = "PVT_planche";

const labelColors: Record<string, string> = {
  bug: "d73a4a",
  feature: "4a7fd4",
  perf: "d9a23b",
  design: "d65a92",
  keyboard: "2ea3a3",
  sync: "8a5cc7",
  site: "3f9e6b",
  api: "7d8590",
  dnd: "e07a3a",
};

export const people: Record<string, string> = {
  CR: "camille-r",
  TM: "theo-m",
  LB: "lea-b",
  AM: "amina-m",
};

function card(
  number: number,
  title: string,
  repo: string,
  kind: "i" | "p" | "d",
  labels: string[],
  who?: string,
): Card {
  const common = {
    item_id: `PVTI_${number}`,
    number,
    title,
    url: `https://github.com/planche/${repo}/issues/${number}`,
    repo: `planche/${repo}`,
    assignees: who ? [user({ id: `U_${who}`, login: people[who] })] : [],
    labels: labels.map((name) => ({ name, color: labelColors[name] })),
    pending: false,
    updated_by_sync: false,
    details: { created_at: "2026-10-02T12:00:00Z" },
  };

  if (kind === "p") {
    return pullRequest({ ...common, id: `PR_${number}` });
  }

  return issue({ ...common, id: `I_${number}`, state: kind === "d" ? "closed" : "open" });
}

function column(id: string, name: string, color: string, cards: Card[]): Column {
  return columnFixture({ option_id: id, name, color, cards });
}

export function mockupBoard(): Board {
  const board = boardFixture({
    project: {
      id: PROJECT,
      number: 1,
      title: "Planche — v1.2",
      url: "https://github.com/orgs/planche/projects/1",
    },
    view: { number: 1, name: "Board", manual_order: true },
    field: { id: "PVTSSF_status", name: "Status" },
    columns: [
      column("backlog", "Backlog", "GRAY", [
        card(218, "Export board as Markdown", "app", "i", ["feature"]),
        card(
          214,
          "Shortcut to move a card to the next column",
          "app",
          "i",
          ["keyboard", "feature"],
          "CR",
        ),
        card(209, "Disk cache for GraphQL responses", "sync", "i", ["perf"], "TM"),
        card(201, "Support Iteration fields", "sync", "i", ["api"]),
        card(198, "Paste an image into a comment", "app", "i", ["feature"]),
        card(193, "Remember the window size", "app", "i", []),
      ]),
      column("todo", "Todo", "BLUE", [
        card(226, "Show linked PRs in issue detail", "app", "i", ["feature", "design"], "CR"),
        card(223, "Column counter ignores filtered cards", "app", "i", ["bug"], "LB"),
        card(219, "Pricing page: compare Solo and Team", "site", "i", ["site"], "AM"),
      ]),
      column("doing", "In progress", "YELLOW", [
        card(
          231,
          "Drag and drop across columns with persisted order",
          "app",
          "i",
          ["feature", "dnd"],
          "CR",
        ),
        card(232, "sync: exponential backoff on 502 errors", "sync", "p", ["sync"], "TM"),
        card(228, "Dark theme: label contrast", "app", "i", ["design"], "AM"),
      ]),
      column("review", "In review", "PURPLE", [
        card(229, "Command palette: fuzzy search", "app", "p", ["feature"], "CR"),
        card(227, "Fix WebSocket memory leak", "sync", "p", ["bug"], "LB"),
      ]),
      column("done", "Done", "GREEN", [
        card(220, "Onboarding: token validation", "app", "d", [], "CR"),
        card(215, "App icon and menu bar extra", "site", "d", ["design"], "AM"),
        card(211, "Settings: sync interval", "app", "d", [], "TM"),
      ]),
    ],
    pending_count: 0,
    synced_at: new Date(Date.now() - 150_000).toISOString(),
  });

  for (const [position, card] of board.columns.flatMap((column) => column.cards).entries()) {
    card.position = position;
  }

  return board;
}

/** 1000 cards over five columns, for the scroll budget. */
function bigBoard(): Board {
  const board = mockupBoard();

  for (const [index, col] of board.columns.entries()) {
    col.cards = Array.from({ length: 200 }, (_, i) => ({
      ...card(
        index * 1000 + i,
        `Synthetic card ${index * 200 + i} with a title long enough to wrap`,
        "app",
        "i",
        i % 3 ? ["feature"] : ["bug", "perf"],
        i % 4 ? "CR" : undefined,
      ),
      position: index * 200 + i,
    }));
  }

  return board;
}

export function boardFor(scenario: Scenario): Board | null {
  switch (scenario) {
    case "labels": {
      const board = mockupBoard();
      const item = board.columns[1].cards[0];

      if (item.kind === "issue") {
        item.labels = [
          { name: "A very long label name that needs truncation", color: labelColors.feature },
          ...["bug", "design", "keyboard", "api"].map((name) => ({
            name,
            color: labelColors[name],
          })),
        ];
      }

      return board;
    }
    case "relations": {
      const board = mockupBoard();

      Object.assign(board.columns[0].cards[0], {
        details: { sub_issues: { completed: 0, total: 2 } },
      });
      Object.assign(board.columns[0].cards[1], { details: { pull_request_count: 3 } });
      Object.assign(board.columns[1].cards[0], {
        details: {
          created_at: "2026-10-02T12:00:00Z",
          parent_title: "A parent issue with a very long title that should stay on one line",
          pull_request_count: 1,
          pull_request: {
            number: 62222,
            title: "Add linked pull requests",
            state: "merged",
            is_draft: false,
          },
          blocked_by: 2,
          blocking: 1,
          sub_issues: { completed: 2, total: 5 },
        },
      });

      return board;
    }

    case "six-statuses": {
      const board = mockupBoard();

      board.columns.push(column("cancelled", "Cancelled", "GRAY", []));

      return board;
    }

    case "loading":
    case "uncached-sync-error":
      return null;
    case "big":
      return bigBoard();

    case "empty": {
      const board = mockupBoard();

      for (const col of board.columns) {
        col.cards = [];
      }

      return board;
    }

    case "syncing": {
      const board = mockupBoard();

      board.columns[1].cards[1].updated_by_sync = true;
      board.columns[3].cards[0].updated_by_sync = true;

      return board;
    }

    case "sorted": {
      const board = mockupBoard();

      if (board.view) {
        board.view.manual_order = false;
      }

      return board;
    }

    case "offline": {
      const board = mockupBoard();

      board.columns[2].cards[0].pending = true;
      board.pending_count = 1;

      return board;
    }

    default:
      return mockupBoard();
  }
}

export const projects: ProjectList = {
  owners: [
    {
      login: "camille-r",
      is_org: false,
      projects: [{ id: "PVT_personal", number: 3, title: "Roadmap Q4", closed: false, url: "" }],
    },
    {
      login: "planche",
      is_org: true,
      projects: [
        { id: PROJECT, number: 1, title: "Planche — v1.2", closed: false, url: "" },
        { id: "PVT_api", number: 2, title: "API Gateway", closed: false, url: "" },
        { id: "PVT_design", number: 4, title: "Design system", closed: false, url: "" },
        { id: "PVT_docs", number: 5, title: "Docs & site", closed: false, url: "" },
      ],
    },
  ],
  sso_blocked: [],
};

export function statusFor(scenario: Scenario): SyncStatus {
  const base = { last_sync_at: Date.now() - 150_000, retry_at: null, pending: 0 };

  switch (scenario) {
    case "loading":
      return {
        ...base,
        last_sync_at: null,
        state: { type: "syncing", page: 1, pages: 2, items_total: 142 },
      };
    case "syncing":
      return { ...base, state: { type: "syncing", page: 3, pages: 5, items_total: 480 } };
    case "offline":
      return { ...base, pending: 1, retry_at: Date.now() + 24_000, state: { type: "offline" } };
    case "rate-limited":
      return { ...base, retry_at: Date.now() + 60_000, state: { type: "rate_limited" } };
    case "sync-error":
    case "uncached-sync-error":
      return { ...base, state: { type: "error", message: "Token rejected by GitHub (401)" } };
    default:
      return { ...base, state: { type: "idle" } };
  }
}

export const signedIn = authStatus({ id: "U_CR", login: "camille-r" });
export const signedOut = authStatus({ id: null, login: null });
export const onboarding = (s: Scenario) =>
  s === "onboarding" ||
  s === "oauth-waiting" ||
  s === "oauth-denied" ||
  s === "oauth-copy-error" ||
  s === "checking" ||
  s === "valid" ||
  s === "invalid" ||
  s === "valid-projects-error";
