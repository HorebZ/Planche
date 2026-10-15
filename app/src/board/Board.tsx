import { useEffect, useRef } from "react";
import { type Board as BoardData, commands } from "@/ipc/bindings";
import { Column } from "./Column";

/** The read-only board: one column per option, each scrolling on its own. */
export function Board({ board }: { board: BoardData }) {
	usePaintedMark();
	return (
		<div data-slot="board" className="flex h-full items-start gap-2.5 overflow-x-auto px-3.5 py-3">
			{board.columns.map((column) => (
				<Column key={column.option_id ?? "none"} column={column} />
			))}
		</div>
	);
}

/** Reports the first paint of a cached board to Rust, for the 500 ms budget. Dev server, or a
 * bundle built with VITE_PERF=1. */
function usePaintedMark() {
	const sent = useRef(false);
	useEffect(() => {
		if (!(import.meta.env.DEV || import.meta.env.VITE_PERF) || sent.current) return;
		sent.current = true;
		requestAnimationFrame(() => {
			commands.perfMark("board-painted", performance.now()).catch(() => {});
		});
	}, []);
}
