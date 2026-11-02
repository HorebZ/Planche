import type { ComponentProps } from "react";
import { Kbd } from "@/components/ui/kbd";
import { keysFor } from "@/keyboard/shortcuts";
import { cn } from "@/lib/cn";

const keys = [
  { keys: [...keysFor("drag.left"), ...keysFor("drag.right")], label: "Column" },
  { keys: [...keysFor("drag.up"), ...keysFor("drag.down")], label: "Position" },
  { keys: keysFor("drag.drop"), label: "Drop" },
  { keys: keysFor("drag.cancel"), label: "Cancel" },
];

/** The keys of a drag, at the bottom of the board while a card is lifted. */
export function DragHelpBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="drag-help-bar"
      className={cn(
        "flex h-[30px] w-max items-center gap-3 rounded-lg bg-elevated px-3 text-fg-2 text-sm shadow-pop",
        className,
      )}
      {...props}
    >
      {keys.map((key) => (
        <span
          key={key.label}
          className="flex items-center gap-[5px]"
        >
          {key.keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
          {key.label}
        </span>
      ))}
    </div>
  );
}
