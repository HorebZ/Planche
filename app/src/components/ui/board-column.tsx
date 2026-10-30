import { Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { type StatusKey, StatusSquare, statusLabels } from "@/components/ui/status";
import { cn } from "@/lib/cn";

type BoardColumnProps = ComponentProps<"section"> & {
  status: StatusKey;
  count: number;
  onAddDraft?: () => void;
  name?: string;
  /** A card from another column is over this one, so the header counts it before the drop. */
  dropTarget?: boolean;
  hiddenCount?: number;
  empty?: boolean;
};

const headerButtonClass = "size-6 rounded-sm text-fg-3 hover:text-fg [&_svg]:size-4";

export function BoardColumn({
  status,
  count,
  onAddDraft,
  name,
  dropTarget = false,
  hiddenCount,
  empty = false,
  className,
  children,
  ...props
}: BoardColumnProps) {
  return (
    <section
      data-slot="board-column"
      data-drop-target={dropTarget || undefined}
      className={cn(
        "relative flex w-column shrink-0 flex-col gap-1.5 rounded-xl bg-hover px-[5px] pt-0.5 pb-1.5",
        className,
      )}
      {...props}
    >
      <header className="flex h-[34px] items-center gap-[7px] pr-0.5 pl-1.5">
        <StatusSquare status={status} />
        <span className="font-medium text-base">{name ?? statusLabels[status]}</span>
        <span
          data-slot="board-column-count"
          className="text-[12px] text-fg-3 tabular-nums"
        >
          {dropTarget ? count + 1 : count}
        </span>
        <span className="flex-1" />
        {onAddDraft ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Add draft to ${name ?? statusLabels[status]}`}
            className={headerButtonClass}
            onClick={onAddDraft}
          >
            <Plus />
          </Button>
        ) : null}
      </header>
      {empty ? (
        <div className="grid h-[72px] place-items-center rounded-lg border border-line-strong border-dashed text-[11.5px] text-fg-3">
          Drop cards here
        </div>
      ) : (
        children
      )}
      {hiddenCount != null && hiddenCount > 0 ? (
        <button
          type="button"
          className="h-6 rounded-md px-2 text-left text-fg-3 text-sm transition-colors hover:bg-hover hover:text-fg focus-visible:shadow-ring"
        >
          {hiddenCount} more
        </button>
      ) : null}
      {dropTarget ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_var(--pl-ring)]"
        />
      ) : null}
    </section>
  );
}
