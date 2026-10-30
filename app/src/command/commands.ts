import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Columns3,
  FolderKanban,
  List,
  LogOut,
  type LucideIcon,
  Plus,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { statusTone } from "@/board/statusTone";
import type { StatusKey } from "@/components/ui/status";
import type { Board, Card, Intent, OptionId, OwnerProjects, User } from "@/ipc/bindings";

/** The column of a card, as an index into `board.columns`. */
export function columnIndexOf(board: Board, card: Card) {
  return board.columns.findIndex((c) => c.cards.some((x) => x.item_id === card.item_id));
}

export function moveTo(board: Board, card: Card, to: OptionId | null): Intent {
  return {
    type: "move_card",
    project_id: board.project.id,
    item_id: card.item_id,
    field_id: board.field.id,
    to,
    placement: "keep",
  };
}

/** Assigns `user`, or unassigns them when they already are. `null` for a redacted card. */
export function toggleAssignee(board: Board, card: Card, user: User): Intent | null {
  if (card.kind === "redacted") {
    return null;
  }
  const assigned = card.assignees.some((u) => u.id === user.id);
  return {
    type: "set_assignees",
    project_id: board.project.id,
    item_id: card.item_id,
    add: assigned ? [] : [user],
    remove: assigned ? [user] : [],
  };
}

export function archive(board: Board, card: Card): Intent {
  return { type: "archive", project_id: board.project.id, item_id: card.item_id };
}

export function createDraft(board: Board, column: OptionId | null, title: string): Intent {
  return {
    type: "create_draft",
    project_id: board.project.id,
    // The card shown until GitHub answers with the real item.
    item_id: `draft:${crypto.randomUUID()}`,
    field_id: board.field.id,
    column,
    title,
  };
}

export type PaletteCommand = {
  /** cmdk's value: what the query matches against. Unique. */
  value: string;
  group: "status" | "card" | "commands";
  current?: boolean;
  status?: StatusKey;
  label: string;
  icon: LucideIcon;
  run: () => void;
};

type Actions = {
  move: (to: OptionId | null) => void;
  assign: () => void;
  archive: () => void;
  newIssue: () => void;
  syncNow: () => void;
  openProject: (id: string) => void;
  signOut: () => void;
  showBoard: () => void;
  showList: () => void;
};

/** The palette's commands. Actions on the selected card come first, when there is one. */
export function paletteCommands(
  board: Board | null,
  card: Card | null,
  owners: OwnerProjects[],
  actions: Actions,
): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  const from = board && card ? columnIndexOf(board, card) : -1;
  if (board && card && from >= 0) {
    for (const [index, column] of board.columns.entries()) {
      commands.push({
        value: `Move to ${column.name}`,
        group: "status",
        current: index === from,
        status: statusTone(column.color, column.name),
        label: `Move to ${column.name}`,
        icon: index > from ? ArrowRight : ArrowLeft,
        run: () => {
          if (index !== from) {
            actions.move(column.option_id);
          }
        },
      });
    }
    if (card.kind !== "redacted") {
      commands.push({
        value: "Assign",
        group: "card",
        label: "Assign…",
        icon: UserPlus,
        run: actions.assign,
      });
    }
    commands.push({
      value: "Archive",
      group: "card",
      label: "Archive",
      icon: Archive,
      run: actions.archive,
    });
  }
  commands.push(
    {
      value: "New draft",
      group: "commands",
      label: "New draft",
      icon: Plus,
      run: actions.newIssue,
    },
    {
      value: "Sync now",
      group: "commands",
      label: "Sync now",
      icon: RefreshCw,
      run: actions.syncNow,
    },
  );
  for (const owner of owners) {
    for (const project of owner.projects) {
      if (project.closed || project.id === board?.project.id) {
        continue;
      }
      commands.push({
        value: `Go to project ${project.title} ${owner.login}/${project.number}`,
        group: "commands",
        label: `Go to project ${project.title}`,
        icon: FolderKanban,
        run: () => actions.openProject(project.id),
      });
    }
  }
  commands.push({
    value: "Show board",
    group: "commands",
    label: "Show board",
    icon: Columns3,
    run: actions.showBoard,
  });
  commands.push({
    value: "Show list",
    group: "commands",
    label: "Show list",
    icon: List,
    run: actions.showList,
  });
  commands.push({
    value: "Sign out",
    group: "commands",
    label: "Sign out",
    icon: LogOut,
    run: actions.signOut,
  });
  return commands;
}

/** Cards whose title, number or repo holds each word of `query` in order, at most `limit`. */
export function matchCards(board: Board | null, query: string, limit = 50): Card[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!board || words.length === 0) {
    return [];
  }
  const found: Card[] = [];
  for (const card of board.columns.flatMap((c) => c.cards)) {
    if (card.kind === "redacted") {
      continue;
    }
    const text =
      `${card.title} ${"number" in card ? `${card.repo}#${card.number}` : ""}`.toLowerCase();
    if (words.every((word) => inOrder(text, word))) {
      found.push(card);
    }
    if (found.length === limit) {
      break;
    }
  }
  return found;
}

function inOrder(text: string, word: string) {
  let at = 0;
  for (const char of text) {
    if (char === word[at]) {
      at++;
    }
  }
  return at === word.length;
}
