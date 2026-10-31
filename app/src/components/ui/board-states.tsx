import { CloudOff } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

const cardWidths = [
  ["78%", "52%"],
  ["64%", "70%"],
  ["86%", "40%"],
  ["58%", "62%"],
];

export function BoardErrorCard({
  message,
  pending,
  onRetry,
  onBack,
}: {
  message: string;
  pending: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div
      data-slot="board-error"
      role="alert"
      className="flex max-w-[440px] flex-col items-center gap-3 rounded-window bg-elevated p-6 text-center shadow-pop"
    >
      <CloudOff
        className="size-6 text-danger"
        aria-hidden
      />
      <h1 className="font-semibold text-[15px]">Could not load this project</h1>
      <p className="max-w-full break-words text-fg-2">{message}</p>
      <p className="text-fg-3 text-xs">No saved board is available to show.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onBack}>Choose another project</Button>
        <Button
          variant="primary"
          disabled={pending}
          onClick={onRetry}
        >
          {pending ? "Retrying…" : "Retry now"}
        </Button>
      </div>
    </div>
  );
}

/** A column of placeholder cards while the first sync loads the board. */
export function SkeletonColumn({
  cards,
  titleWidth = 56,
  className,
  ...props
}: ComponentProps<"section"> & {
  cards: number;
  titleWidth?: number;
}) {
  return (
    <section
      data-slot="skeleton-column"
      aria-hidden
      className={cn(
        "flex w-column shrink-0 flex-col gap-2 rounded-xl bg-column p-[5px]",
        className,
      )}
      {...props}
    >
      <div className="flex h-[34px] items-center gap-[7px] px-1.5">
        <Skeleton className="size-3.5 rounded-full" />
        <Skeleton
          className="h-[9px] rounded-[3px]"
          style={{ width: titleWidth }}
        />
      </div>
      {Array.from({ length: cards }, (_, i) => {
        const [first, second] = cardWidths[i % cardWidths.length];

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            key={i}
            className="flex flex-col gap-[7px] rounded-lg bg-card px-[9px] py-2.5 shadow-card"
            style={{ opacity: 1 - i * 0.18 }}
          >
            <div className="flex gap-[7px]">
              <Skeleton className="size-[11px] rounded-[3px]" />
              <Skeleton
                className="h-[9px] rounded-[3px]"
                style={{ width: first }}
              />
            </div>
            <Skeleton
              className="ml-[18px] h-[9px] rounded-[3px]"
              style={{ width: second }}
            />
            <div className="ml-[18px] flex items-center gap-1.5">
              <Skeleton className="h-2 w-[70px] rounded-[3px]" />
              <span className="flex-1" />
              <Skeleton className="size-4 rounded-full" />
            </div>
          </div>
        );
      })}
    </section>
  );
}

type EmptyBoardCardProps = ComponentProps<"div"> & {
  onNewIssue?: () => void;
  onAddFromRepo?: () => void;
};

/** The card centered over an empty board. A button without its handler is disabled. */
export function EmptyBoardCard({
  onNewIssue,
  onAddFromRepo,
  className,
  ...props
}: EmptyBoardCardProps) {
  return (
    <div
      data-slot="empty-board-card"
      className={cn(
        "flex w-[360px] flex-col items-center gap-1.5 rounded-window bg-elevated px-6 pt-6 pb-5 text-center shadow-pop",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="mb-2.5 flex items-start gap-[3px]"
      >
        <span className="h-[22px] w-[9px] rounded-[2px] bg-line-strong" />
        <span className="h-3.5 w-[9px] rounded-[2px] bg-line-strong" />
        <span className="h-[18px] w-[9px] rounded-[2px] shadow-[inset_0_0_0_1.5px_var(--pl-border-strong)]" />
      </div>
      <div className="font-[650] text-[15px] leading-5">This board is empty</div>
      <p className="max-w-[290px] text-pretty text-[12.5px] text-fg-2 leading-[18px]">
        Add existing issues and pull requests from your repos, or create a new issue.
      </p>
      <div className="mt-3.5 flex gap-2">
        <Button
          variant="primary"
          className="h-7 text-[12.5px] focus-visible:shadow-[0_0_0_2px_var(--pl-elevated),0_0_0_4px_var(--pl-focus)]"
          disabled={!onNewIssue}
          onClick={onNewIssue}
        >
          New draft
          <Kbd
            variant="onAccent"
            size="sm"
          >
            C
          </Kbd>
        </Button>
        <Button
          className="h-7 text-[12.5px]"
          disabled={!onAddFromRepo}
          onClick={onAddFromRepo}
        >
          Add from repo…
          <Kbd
            size="sm"
            className="text-fg-3"
          >
            A
          </Kbd>
        </Button>
      </div>
    </div>
  );
}
