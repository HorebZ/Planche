import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { BoardColumn } from "@/components/ui/board-column";
import { CardPlaceholder } from "@/components/ui/issue-card";
import type { Column as BoardColumnData, ItemId } from "@/ipc/bindings";
import { useUi } from "@/stores/ui";
import { Card } from "./Card";
import { type DraftSubmit, NewDraft } from "./NewDraft";
import { statusTone } from "./statusTone";

const GAP = 5;

/** Where a lifted card would land in this column. `index` counts the cards without it. */
export type Landing = { index: number; height: number; fromHere: boolean };

type ColumnProps = {
	column: BoardColumnData;
	projectId: string;
	index: number;
	/** The lifted card, shown here as a ghost when it comes from this column. */
	activeId: ItemId | null;
	landing: Landing | null;
	onCreateDraft: DraftSubmit;
};

type Row = { kind: "card"; card: BoardColumnData["cards"][number] } | { kind: "placeholder"; height: number };

/** A column whose cards scroll inside it. Only the cards in view are mounted. */
export function Column({ column, projectId, index, activeId, landing, onCreateDraft }: ColumnProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const { setNodeRef } = useDroppable({ id: `column:${index}` });
	const rows = useMemo<Row[]>(() => {
		const cards: Row[] = column.cards.map((card) => ({ kind: "card", card }));
		if (!landing) return cards;
		// Count the landing index among the cards without the lifted one, which stays as a ghost.
		const others = column.cards.filter((c) => c.item_id !== activeId);
		const before = others[landing.index];
		const at = before ? column.cards.indexOf(before) : column.cards.length;
		cards.splice(at, 0, { kind: "placeholder", height: landing.height });
		return cards;
	}, [column.cards, landing, activeId]);
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 86,
		gap: GAP,
		overscan: 3,
		getItemKey: (i) => {
			const row = rows[i];
			return row.kind === "card" ? row.card.item_id : "placeholder";
		},
	});
	const selectedId = useUi((s) => s.selectedId);
	const drafting = useUi((s) => s.overlay?.type === "draft" && s.overlay.column === column.option_id);
	// A selection out of view mounts its card first, so the card can take the focus.
	useEffect(() => {
		const at = rows.findIndex((row) => row.kind === "card" && row.card.item_id === selectedId);
		if (at >= 0) virtualizer.scrollToIndex(at, { align: "auto" });
	}, [selectedId, rows, virtualizer]);
	const incoming = landing != null && !landing.fromHere;
	return (
		<BoardColumn
			ref={setNodeRef}
			data-column-index={index}
			status={statusTone(column.color)}
			name={column.name}
			count={column.cards.length}
			onAddDraft={() => useUi.getState().open({ type: "draft", column: column.option_id })}
			dropTarget={incoming}
			empty={column.cards.length === 0 && !incoming && !drafting}
			className="max-h-full"
		>
			{drafting ? <NewDraft projectId={projectId} column={column.option_id} onSubmit={onCreateDraft} /> : null}
			<SortableContext items={column.cards.map((c) => c.item_id)} strategy={verticalListSortingStrategy}>
				<div ref={scrollRef} data-slot="column-scroll" className="-m-[5px] mt-0 min-h-0 overflow-y-auto p-[5px] pt-0">
					<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
						{virtualizer.getVirtualItems().map((item) => {
							const row = rows[item.index];
							return (
								<div
									key={item.key}
									data-index={item.index}
									ref={virtualizer.measureElement}
									className="absolute top-0 left-0 w-full"
									style={{ transform: `translateY(${item.start}px)` }}
								>
									{row.kind === "card" ? (
										<Card
											status={statusTone(column.color, column.name)}
											card={row.card}
											ghost={row.card.item_id === activeId}
											selected={row.card.item_id === selectedId}
										/>
									) : (
										<CardPlaceholder height={row.height} />
									)}
								</div>
							);
						})}
					</div>
				</div>
			</SortableContext>
		</BoardColumn>
	);
}
