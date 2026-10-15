import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { BoardColumn } from "@/components/ui/board-column";
import type { Column as BoardColumnData } from "@/ipc/bindings";
import { Card } from "./Card";
import { statusTone } from "./statusTone";

const GAP = 5;

/** A column whose cards scroll inside it. Only the cards in view are mounted. */
export function Column({ column }: { column: BoardColumnData }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: column.cards.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 86,
		gap: GAP,
		overscan: 3,
		getItemKey: (index) => column.cards[index].item_id,
	});
	return (
		<BoardColumn
			status={statusTone(column.color)}
			name={column.name}
			count={column.cards.length}
			empty={column.cards.length === 0}
			className="max-h-full"
		>
			<div ref={scrollRef} data-slot="column-scroll" className="-m-[5px] mt-0 min-h-0 overflow-y-auto p-[5px] pt-0">
				<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
					{virtualizer.getVirtualItems().map((row) => (
						<div
							key={row.key}
							data-index={row.index}
							ref={virtualizer.measureElement}
							className="absolute top-0 left-0 w-full"
							style={{ transform: `translateY(${row.start}px)` }}
						>
							<Card card={column.cards[row.index]} />
						</div>
					))}
				</div>
			</div>
		</BoardColumn>
	);
}
