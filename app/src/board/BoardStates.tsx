import { BoardColumn } from "@/components/ui/board-column";
import { EmptyBoardCard, SkeletonColumn } from "@/components/ui/board-states";
import { Progress } from "@/components/ui/progress";
import type { Board, OptionId } from "@/ipc/bindings";
import { statusTone } from "./statusTone";

const boardClass = "flex h-full items-start gap-2.5 overflow-x-auto px-3 pt-0.5 pb-3";

/** 5a: the first sync has not finished. */
export function LoadingBoard() {
  return (
    <div
      data-state="loading"
      className={boardClass}
    >
      {[3, 2, 3, 1, 2].map((cards, i) => (
        <SkeletonColumn
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
          key={i}
          cards={cards}
          titleWidth={[48, 36, 64, 52, 40][i]}
        />
      ))}
    </div>
  );
}

/** 5d: the board has columns but no card. */
export function EmptyBoard({
  board,
  onNewIssue,
  onNewDraft,
}: {
  board: Board;
  onNewIssue: () => void;
  onNewDraft: (column: OptionId | null) => void;
}) {
  return (
    <div
      data-state="empty"
      className="relative h-full"
    >
      <div className={boardClass}>
        {board.columns.map((column) => (
          <BoardColumn
            key={column.option_id ?? "none"}
            status={statusTone(column.color, column.name)}
            name={column.name}
            count={0}
            onAddDraft={() => onNewDraft(column.option_id)}
            empty
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        {/* Add from repo arrives with #11. */}
        <EmptyBoardCard
          onNewIssue={onNewIssue}
          className="pointer-events-auto"
        />
      </div>
    </div>
  );
}

/** The 2 px bar under the toolbar while a sync runs. */
export function SyncBar() {
  return (
    <Progress
      indeterminate
      className="absolute inset-x-0 top-[90px] z-10 w-auto"
    />
  );
}
