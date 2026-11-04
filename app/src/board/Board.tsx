import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DisplayProperty } from "@/components/ui/display-menu";
import { DragHelpBar } from "@/components/ui/drag";
import { IssueCard } from "@/components/ui/issue-card";
import {
  type Card as BoardCard,
  type Board as BoardData,
  commands,
  type Intent,
  type ItemId,
} from "@/ipc/bindings.types";
import { commandFor, dragCodes } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { cardData } from "./Card";
import { Column, type Landing } from "./Column";
import { markDropFrame, startFrames, stopFrames } from "./dragPerf";
import { dropPlacement } from "./filter";
import { flip, type Rect } from "./flip";
import { statusTone } from "./statusTone";
import type { DispatchResult } from "./useActions";

/** A spot on the board: a column, and an index among its cards without the lifted one. */
type Spot = { column: number; index: number };

type Drag = {
  id: ItemId;
  card: BoardCard;
  from: Spot;
  to: Spot | null;
  height: number;
  keyboard: boolean;
};

const CARD_GAP = 8;

/** The cards of a column, without the lifted one. */
function others(board: BoardData, column: number, id: ItemId) {
  return board.columns[column].cards.filter((c) => c.item_id !== id);
}

/** Pointer drops require a hit; keyboard drags use the card's translated rectangle. */
const collision: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) {
    return closestCenter(args);
  }

  const hits = pointerWithin(args);
  const card = hits.find((hit) => !String(hit.id).startsWith("column:"));

  if (card) {
    return [card];
  }

  return hits;
};

type BoardProps = {
  readOnly?: boolean;
  hiddenProperties?: DisplayProperty[];
  board: BoardData;
  canonicalBoard: BoardData;
  onMove: (intent: Intent) => Promise<DispatchResult>;
  /** A title typed in a column's new-draft field, and that column. */
  onCreateDraft: (
    column: BoardData["columns"][number],
    title: string,
    observe?: (result: DispatchResult) => void,
  ) => Promise<DispatchResult>;
};

/** The board: one column per option, each scrolling on its own. Cards move by drag or keyboard. */
export const Board = memo(function Board({
  board,
  onMove,
  onCreateDraft,
  hiddenProperties,
  canonicalBoard,
  readOnly = false,
}: BoardProps) {
  usePaintedMark();

  const setDragging = useUi((s) => s.setDragging);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  }, []);
  const boardRef = useRef(board);
  const canonicalRef = useRef(canonicalBoard);

  boardRef.current = board;
  canonicalRef.current = canonicalBoard;

  const manualOrder = board.view?.manual_order ?? true;

  // Arrows move the landing spot itself, then the overlay follows it.
  const coordinateGetter = useCallback<KeyboardCoordinateGetter>(
    (event, { currentCoordinates }) => {
      const current = dragRef.current;

      if (!current) {
        return undefined;
      }

      const b = boardRef.current;
      let { column, index } = current.to ?? current.from;
      const size = (c: number) => others(b, c, current.id).length;

      switch (commandFor(event, "drag")) {
        case "drag.right":
          column = Math.min(column + 1, b.columns.length - 1);
          index = Math.min(index, size(column));
          break;
        case "drag.left":
          column = Math.max(column - 1, 0);
          index = Math.min(index, size(column));
          break;
        case "drag.down":
          if (manualOrder) {
            index = Math.min(index + 1, size(column));
          }

          break;
        case "drag.up":
          if (manualOrder) {
            index = Math.max(index - 1, 0);
          }

          break;
        default:
          return undefined;
      }

      event.preventDefault();
      setDrag({ ...current, to: { column, index } });

      return slotCoordinates(b, current.id, { column, index }) ?? currentCoordinates;
    },
    [manualOrder, setDrag],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter,
      keyboardCodes: {
        start: dragCodes("drag.lift"),
        cancel: dragCodes("drag.cancel"),
        end: dragCodes("drag.drop"),
      },
    }),
  );

  const locate = useCallback((id: ItemId): Spot | null => {
    const b = boardRef.current;

    for (const [column, c] of b.columns.entries()) {
      const index = c.cards.findIndex((card) => card.item_id === id);

      if (index >= 0) {
        return { column, index };
      }
    }

    return null;
  }, []);

  const onDragStart = useCallback(
    ({ active, activatorEvent }: DragStartEvent) => {
      const id = String(active.id);
      const from = locate(id);

      if (!from || readOnly) {
        return;
      }

      const card = boardRef.current.columns[from.column].cards[from.index];
      const height = active.rect.current.initial?.height ?? 86;

      setDrag({
        id,
        card,
        from,
        to: from,
        height,
        keyboard: activatorEvent instanceof KeyboardEvent,
      });
      setDragging(true);
      startFrames();
    },
    [locate, setDrag, setDragging, readOnly],
  );

  const onDragMove = useCallback(
    ({ active, over, activatorEvent, delta }: DragMoveEvent) => {
      const current = dragRef.current;

      if (!current || current.keyboard) {
        return;
      }

      if (!over) {
        if (current.to) {
          setDrag({ ...current, to: null });
        }

        return;
      }

      const b = boardRef.current;
      const overId = String(over.id);
      const pointerY =
        activatorEvent instanceof PointerEvent || activatorEvent instanceof MouseEvent
          ? activatorEvent.clientY + delta.y
          : (active.rect.current.translated?.top ?? 0);
      let to: Spot;

      if (overId.startsWith("column:")) {
        const column = Number(overId.slice("column:".length));
        const placeholder =
          column === current.to?.column
            ? document.querySelector('[data-slot="card-placeholder"]')?.getBoundingClientRect()
            : null;

        // The placeholder is not droppable; hovering it must not send the card to the end.
        if (placeholder && pointerY >= placeholder.top && pointerY <= placeholder.bottom) {
          return;
        }

        to = { column, index: others(b, column, current.id).length };
      } else {
        const spot = locate(overId);

        if (!spot) {
          return;
        }

        const index = others(b, spot.column, current.id).findIndex((c) => c.item_id === overId);
        const below = pointerY > over.rect.top + over.rect.height / 2;

        to =
          overId === current.id
            ? current.from
            : { column: spot.column, index: below ? index + 1 : index };
      }

      // A sorted view keeps each column's order: only the column changes.
      if (!manualOrder) {
        to = to.column === current.from.column ? current.from : { column: to.column, index: 0 };
      }

      if (to.column !== current.to?.column || to.index !== current.to?.index) {
        setDrag({ ...current, to });
      }
    },
    [locate, manualOrder, setDrag],
  );

  const droppedAt = useRef<number | null>(null);
  const [settle, setSettle] = useState<{
    drag: Drag;
    from: Rect & { width: number };
    board: BoardData | null;
  } | null>(null);
  const end = useCallback(
    async (drop: boolean, released: (Rect & { width: number }) | null) => {
      const current = dragRef.current;
      const intent =
        drop && current
          ? intentFor(boardRef.current, canonicalRef.current, current, manualOrder)
          : null;

      if (current && released) {
        setSettle({ drag: current, from: released, board: intent ? boardRef.current : null });
      }

      setDrag(null);
      stopFrames();

      if (!intent) {
        return setDragging(false);
      }

      droppedAt.current = performance.now();
      // Board changes held during the drag apply once Rust has the move queued.
      try {
        const result = await onMove(intent);

        if (result.type === "rejected") {
          setSettle((pending) => (pending ? { ...pending, board: null } : null));
          droppedAt.current = null;
        }
      } finally {
        setDragging(false);
      }
    },
    [manualOrder, onMove, setDrag, setDragging],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each commit of a new board, the one a drop causes
  useLayoutEffect(() => {
    if (droppedAt.current == null) {
      return;
    }

    markDropFrame(droppedAt.current);
    droppedAt.current = null;
  }, [board]);

  // Keep the released card in place until its optimistic destination is mounted.
  useLayoutEffect(() => {
    if (drag || !settle || settle.board === board) {
      return;
    }

    flip(settle.drag.id, settle.from, true);
    setSettle(null);
  }, [drag, board, settle]);

  // A failed move: once the board puts the card back, it slides from where it was dropped.
  const reverting = useUi((s) => s.reverting);
  const setReverting = useUi((s) => s.setReverting);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new board until the card has moved back
  useLayoutEffect(() => {
    if (reverting && flip(reverting.id, reverting.from)) {
      setReverting(null);
    }
  }, [board, reverting, setReverting]);

  const landingFor = (column: number): Landing | null =>
    drag && drag.to?.column === column
      ? { index: drag.to.index, height: drag.height, fromHere: drag.from.column === column }
      : null;
  const lifted = drag ?? settle?.drag;
  const liftedCard = lifted ? (
    <IssueCard
      {...cardData(lifted.card)}
      hiddenProperties={hiddenProperties}
      status={
        lifted.card.kind === "draft"
          ? "draft"
          : statusTone(
              board.columns[lifted.from.column].color,
              board.columns[lifted.from.column].name,
            )
      }
      dragState="lifted"
      tabIndex={-1}
    />
  ) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={({ active }: DragEndEvent) => end(true, active.rect.current.translated)}
      onDragCancel={({ active }) => end(false, active.rect.current.translated)}
    >
      <div className="relative h-full">
        <div
          data-slot="board"
          className="flex h-full items-start gap-2.5 overflow-x-auto px-3 pt-0.5 pb-3"
        >
          {board.columns.map((column, index) => (
            <Column
              readOnly={readOnly}
              key={column.option_id ?? "none"}
              column={column}
              hiddenProperties={hiddenProperties}
              projectId={board.project.id}
              index={index}
              activeId={lifted?.id ?? null}
              landing={landingFor(index)}
              onCreateDraft={(title, observe) => onCreateDraft(column, title, observe)}
            />
          ))}
        </div>
        {drag ? <DragHelpBar className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2" /> : null}
      </div>
      <DragOverlay dropAnimation={null}>{drag ? liftedCard : null}</DragOverlay>
      {settle ? (
        <div
          data-slot="drop-preview"
          className="pointer-events-none fixed z-50"
          style={{ left: settle.from.left, top: settle.from.top, width: settle.from.width }}
        >
          {liftedCard}
        </div>
      ) : null}
    </DndContext>
  );
});

/** The move a drop asks for, or `null` when the card lands where it was. */
function intentFor(
  board: BoardData,
  canonical: BoardData,
  drag: Drag,
  manualOrder: boolean,
): Intent | null {
  const to = drag.to;

  if (!to) {
    return null;
  }

  const sameColumn = to.column === drag.from.column;

  if (sameColumn && (!manualOrder || to.index === drag.from.index)) {
    return null;
  }

  return {
    type: "move_card",
    project_id: board.project.id,
    item_id: drag.id,
    field_id: board.field.id,
    to: board.columns[to.column].option_id,
    placement: !manualOrder
      ? "keep"
      : dropPlacement(canonical, board.columns[to.column], drag.id, to.index),
  };
}

/** The top-left corner of a landing spot, for the keyboard sensor. */
function slotCoordinates(board: BoardData, id: ItemId, spot: Spot) {
  const cards = others(board, spot.column, id);
  const at = cards[spot.index];
  const element = at
    ? document.querySelector(`[data-item-id="${at.item_id}"]`)
    : document.querySelector(`[data-column-index="${spot.column}"]`);

  if (!element) {
    return undefined;
  }

  const rect = element.getBoundingClientRect();

  if (at) {
    return { x: rect.left, y: rect.top };
  }

  // The end of the column: under its last card, or under its header when it has none.
  const last = cards.at(-1);
  const lastRect =
    last && document.querySelector(`[data-item-id="${last.item_id}"]`)?.getBoundingClientRect();

  return { x: rect.left + 5, y: lastRect ? lastRect.bottom + CARD_GAP : rect.top + 38 };
}

/** Reports the first paint of a cached board to Rust, for the 500 ms budget. Dev server, or a
 * bundle built with VITE_PERF=1. */
function usePaintedMark() {
  const sent = useRef(false);

  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_PERF) || sent.current) {
      return;
    }

    sent.current = true;
    requestAnimationFrame(() => {
      commands.perfMark("board-painted", performance.now()).catch(() => {});
    });
  }, []);
}
