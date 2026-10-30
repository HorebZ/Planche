import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { UserList } from "@/components/ui/picker";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { Board, Card, User } from "@/ipc/bindings";
import { assignableUsersQuery, errorMessage } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import { cardElement, focusCard } from "./Card";

type AssigneePickerProps = {
  board: Board;
  card: Card;
  viewer: User | null;
  onToggle: (user: User) => void;
};

/** The repository whose users a card can take. A draft has none, so it borrows the board's first. */
function repoOf(board: Board, card: Card) {
  if ("repo" in card) {
    return card.repo;
  }
  // ponytail: the first repo on the board. A project that spans repos may offer the wrong people.
  for (const c of board.columns.flatMap((column) => column.cards)) {
    if ("repo" in c) {
      return c.repo;
    }
  }
  return null;
}

/** "Assign" in the palette: the users of the card's repository, under the card. */
export function AssigneePicker({ board, card, viewer, onToggle }: AssigneePickerProps) {
  const open = useUi((s) => s.overlay?.type === "assign");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the card element can change between two openings
  const anchor = useMemo(() => ({ current: cardElement(card.item_id) }), [card.item_id, open]);
  const repo = repoOf(board, card);
  const listed = useQuery({ ...assignableUsersQuery(repo ?? ""), enabled: open && repo != null });
  const users = repo ? listed.data : viewer ? [viewer] : [];
  const assigned = card.kind === "redacted" ? [] : card.assignees;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => !next && useUi.getState().open(null)}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        className="w-auto bg-transparent shadow-none"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusCard(card.item_id);
        }}
      >
        <UserList
          users={users?.map((u) => ({
            id: u.id,
            login: u.login,
            avatarUrl: u.avatar_url,
            assigned: assigned.some((a) => a.id === u.id),
          }))}
          status={listed.isError ? errorMessage(listed.error) : undefined}
          onPick={(id) => {
            const user = users?.find((u) => u.id === id);
            useUi.getState().open(null);
            if (user) {
              onToggle(user);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
