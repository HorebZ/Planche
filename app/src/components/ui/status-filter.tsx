import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { type StatusKey, StatusSquare } from "@/components/ui/status";
import { keysFor } from "@/keyboard/shortcuts";

export function StatusFilter({
  options,
  selected,
  onChange,
  disabled,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  options: { id: string | null; name: string; status: StatusKey }[];
  selected: (string | null)[];
  onChange: (selected: (string | null)[]) => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label="Filter statuses"
        >
          <Filter />
          Filter{selected.length ? ` · ${selected.length}` : ""}
          <Kbd size="sm">{keysFor("filters.open").join("")}</Kbd>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[240px]"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuLabel>Show statuses</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id ?? "none"}
            checked={selected.includes(option.id)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(
                checked ? [...selected, option.id] : selected.filter((id) => id !== option.id),
              )
            }
            onSelect={(event) => event.preventDefault()}
          >
            <StatusSquare
              status={option.status}
              aria-hidden
            />
            {option.name}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuItem onSelect={() => onChange([])}>All statuses</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
