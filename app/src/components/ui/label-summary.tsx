import { type CardLabel, LabelChip } from "@/components/ui/label-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function LabelSummary({ labels }: { labels: CardLabel[] }) {
  if (!labels.length) {
    return null;
  }

  return (
    <div className="flex min-w-0 max-w-full items-center gap-1">
      {labels.slice(0, 2).map((label) => (
        <LabelChip
          key={label.name}
          {...label}
          title={label.name}
          className="min-w-0 max-w-[100px]"
        />
      ))}
      {labels.length > 2 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Labels: ${labels.map((label) => label.name).join(", ")}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                }
              }}
              className="shrink-0 rounded-sm px-1 text-fg-3 text-xs outline-none focus-visible:shadow-ring"
            >
              +{labels.length - 2}
            </button>
          </PopoverTrigger>
          <PopoverContent
            aria-label="Issue labels"
            className="max-h-[300px] overflow-y-auto p-3"
          >
            <ul className="space-y-1 break-words text-sm">
              {labels.map((label) => (
                <li key={label.name}>{label.name}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
