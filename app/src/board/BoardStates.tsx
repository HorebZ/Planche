import { BoardColumn } from "@/components/ui/board-column";
import { EmptyBoardCard, SkeletonColumn } from "@/components/ui/board-states";
import { Progress } from "@/components/ui/progress";
import type { Board } from "@/ipc/bindings";
import { statusTone } from "./statusTone";

const boardClass = "flex h-full items-start gap-2.5 overflow-x-auto px-3.5 py-3";

/** 5a: the first sync has not finished. */
export function LoadingBoard() {
	return (
		<div data-state="loading" className={boardClass}>
			{[3, 2, 3, 1, 2].map((cards, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
				<SkeletonColumn key={i} cards={cards} titleWidth={[48, 36, 64, 52, 40][i]} />
			))}
		</div>
	);
}

/** 5d: the board has columns but no card. */
export function EmptyBoard({ board }: { board: Board }) {
	return (
		<div data-state="empty" className="relative h-full">
			<div className={boardClass}>
				{board.columns.map((column) => (
					<BoardColumn
						key={column.option_id ?? "none"}
						status={statusTone(column.color)}
						name={column.name}
						count={0}
						empty
					/>
				))}
			</div>
			<div className="pointer-events-none absolute inset-0 grid place-items-center">
				{/* New issue arrives with #9, Add from repo with #11. */}
				<EmptyBoardCard className="pointer-events-auto" />
			</div>
		</div>
	);
}

/** The 2 px bar under the toolbar while a sync runs. */
export function SyncBar() {
	return <Progress indeterminate className="absolute inset-x-0 top-[47px] z-10 w-auto" />;
}
