import { useMemo } from "react";
import { StatusList } from "@/components/ui/picker";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { Board, Card, OptionId } from "@/ipc/bindings";
import { type CommandId, commandFor, keysFor } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { cardElement, focusCard } from "./Card";
import { statusTone } from "./statusTone";

type StatusMenuProps = { board: Board; card: Card; onMove: (to: OptionId) => void };

/** `S` on a card: its Status menu, under the card. `1` to `6` pick the option of that rank. */
export function StatusMenu({ board, card, onMove }: StatusMenuProps) {
  const open = useUi((s) => s.overlay?.type === "status");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the card element can change between two openings
  const anchor = useMemo(() => ({ current: cardElement(card.item_id) }), [card.item_id, open]);
  const current =
    board.columns.find((c) => c.cards.some((x) => x.item_id === card.item_id))?.option_id ?? null;
  const options = board.columns.flatMap((c) =>
    c.option_id === null
      ? []
      : [
          {
            id: c.option_id,
            name: c.name,
            status: statusTone(c.color, c.name),
            current: c.option_id === current,
          },
        ],
  );
  const shown = options.map((o, i) => ({
    ...o,
    keys: keysFor(`status.${i + 1}` as CommandId).join("") || undefined,
  }));

  const pick = (id: string) => {
    useUi.getState().open(null);

    if (id !== current) {
      onMove(id);
    }
  };

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
        <StatusList
          options={shown}
          onPick={pick}
          onKeyDown={(event) => {
            const command = commandFor(event.nativeEvent, "menu");
            const option = command && shown[Number(command.slice("status.".length)) - 1];

            if (!option) {
              return;
            }

            event.preventDefault();
            pick(option.id);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
