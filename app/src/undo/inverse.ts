import type { Board, Card, Intent } from "@/ipc/bindings";

function find(board: Board, id: string) {
  for (const column of board.columns) {
    const card = column.cards.find((c) => c.item_id === id);
    if (card) {
      return { column, card };
    }
  }
  return null;
}

/**
 * The intent that undoes `intent`, from `board` as it was before it. `null` when it cannot be
 * undone: a new draft would need `deleteProjectV2Item`, which v1 does not send.
 */
export function inverse(board: Board, intent: Intent): Intent | null {
  if (intent.type === "create_draft") {
    return null;
  }
  const found = find(board, intent.item_id);
  if (!found) {
    return null;
  }
  const { column, card } = found;
  switch (intent.type) {
    case "move_card": {
      if (intent.placement === "keep") {
        return { ...intent, to: column.option_id };
      }
      const before = board.columns
        .flatMap((c) => c.cards)
        .filter((c) => c.position < card.position)
        .sort((a, b) => b.position - a.position)[0];
      return {
        ...intent,
        to: column.option_id,
        placement: before ? { after: before.item_id } : "top",
      };
    }
    case "set_assignees": {
      const assigned = card.kind === "redacted" ? [] : card.assignees;
      const has = (id: string) => assigned.some((u) => u.id === id);
      const add = intent.remove.filter((u) => has(u.id));
      const remove = intent.add.filter((u) => !has(u.id));
      return add.length || remove.length ? { ...intent, add, remove } : null;
    }
    case "archive":
      return {
        type: "unarchive",
        project_id: intent.project_id,
        item_id: card.item_id,
        column: column.option_id,
        card,
      };
    case "unarchive":
      return { type: "archive", project_id: intent.project_id, item_id: intent.item_id };
  }
}

/** The verb of an intent, for an error toast: "Couldn't move the card". */
export const verbs: Record<Intent["type"], string> = {
  move_card: "move",
  set_assignees: "assign",
  archive: "archive",
  unarchive: "restore",
  create_draft: "create",
};

/** `#11` for an issue or a pull request, the quoted title for a draft. */
export function cardRef(card: Card) {
  if (card.kind === "issue" || card.kind === "pull_request") {
    return `#${card.number}`;
  }
  return card.kind === "draft" ? `"${card.title}"` : "the card";
}

/** What `intent` does, for its toast, from `board` as it was before it. */
export function describe(board: Board, intent: Intent): string {
  if (intent.type === "create_draft") {
    return `Draft "${intent.title}" created`;
  }
  const card = intent.type === "unarchive" ? intent.card : find(board, intent.item_id)?.card;
  const ref = card ? cardRef(card) : "the card";
  switch (intent.type) {
    case "move_card": {
      const to =
        board.columns.find((c) => c.option_id === intent.to)?.name ?? `No ${board.field.name}`;
      return `${ref} moved to ${to}`;
    }
    case "set_assignees": {
      const logins = (users: { login: string }[]) => users.map((u) => u.login).join(", ");
      if (!intent.remove.length) {
        return `Assigned ${logins(intent.add)} to ${ref}`;
      }
      if (!intent.add.length) {
        return `Unassigned ${logins(intent.remove)} from ${ref}`;
      }
      return `Changed the assignees of ${ref}`;
    }
    case "archive":
      return `${ref} archived`;
    case "unarchive":
      return `${ref} restored`;
  }
}
