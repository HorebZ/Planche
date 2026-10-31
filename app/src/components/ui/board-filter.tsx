import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { type StatusKey, StatusSquare } from "@/components/ui/status";
import { keysFor } from "@/keyboard/shortcuts";

export type BoardFilters = Record<
  "statuses" | "assignees" | "labels" | "repositories",
  (string | null)[]
>;

export const emptyFilters: BoardFilters = {
  statuses: [],
  assignees: [],
  labels: [],
  repositories: [],
};

export function BoardFilter({
  groups,
  selected,
  onChange,
  disabled,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  groups: {
    key: keyof BoardFilters;
    name: string;
    options: { id: string | null; name: string; status?: StatusKey }[];
  }[];
  selected: BoardFilters;
  onChange: (selected: BoardFilters) => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const count = Object.values(selected).reduce((sum, values) => sum + values.length, 0);
  const remove = (key: keyof BoardFilters, id: string | null) =>
    onChange({ ...selected, [key]: selected[key].filter((value) => value !== id) });

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={onOpenChange}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label="Filter issues"
          >
            <Filter />
            Filter{count ? ` · ${count}` : ""}
            <Kbd size="sm">{keysFor("filters.open").join("")}</Kbd>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))] w-[260px] overflow-y-auto"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {groups.map((group) => (
            <DropdownMenuGroup
              key={group.key}
              aria-label={group.name}
            >
              <DropdownMenuLabel>{group.name}</DropdownMenuLabel>
              {group.options.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id ?? "none"}
                  checked={selected[group.key].includes(option.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...selected,
                      [group.key]: checked
                        ? [...selected[group.key], option.id]
                        : selected[group.key].filter((id) => id !== option.id),
                    })
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  {option.status ? (
                    <StatusSquare
                      status={option.status}
                      aria-hidden
                    />
                  ) : null}
                  <span className="truncate">{option.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          ))}
          <DropdownMenuItem onSelect={() => onChange(emptyFilters)}>Clear filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {groups.flatMap((group) =>
        selected[group.key].map((id) => (
          <Button
            key={JSON.stringify([group.key, id])}
            variant="secondary"
            size="sm"
            disabled={disabled}
            aria-label={`Remove ${group.name.toLowerCase()} filter: ${group.options.find((option) => option.id === id)?.name ?? id}`}
            onClick={() => remove(group.key, id)}
            className="max-w-48"
          >
            <span className="truncate">
              {group.name}: {group.options.find((option) => option.id === id)?.name ?? id}
            </span>
            <X aria-hidden />
          </Button>
        )),
      )}
      {count ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(emptyFilters)}
        >
          Clear filters
        </Button>
      ) : null}
    </>
  );
}
