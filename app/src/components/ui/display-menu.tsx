import { Columns3, List, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const properties = { repository: "Repository", labels: "Labels", assignees: "Assignees" };
export type DisplayProperty = keyof typeof properties;

export function DisplayMenu({
  layout,
  onLayoutChange,
  hidden = [],
  onChange,
  disabled,
}: {
  layout: "board" | "list";
  onLayoutChange: (layout: "board" | "list") => void;
  hidden?: DisplayProperty[];
  onChange: (property: DisplayProperty, visible: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
        >
          <SlidersHorizontal />
          Display
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[220px]"
      >
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={layout}
          onValueChange={(value) => onLayoutChange(value as "board" | "list")}
        >
          <DropdownMenuRadioItem value="board">
            <Columns3 />
            Board
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">
            <List />
            List
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Visible properties</DropdownMenuLabel>
        {(Object.keys(properties) as DisplayProperty[]).map((property) => (
          <DropdownMenuCheckboxItem
            key={property}
            checked={!hidden.includes(property)}
            onCheckedChange={(visible) => onChange(property, visible)}
            onSelect={(event) => event.preventDefault()}
          >
            {properties[property]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
