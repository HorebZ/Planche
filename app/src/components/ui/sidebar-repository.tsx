import { BookMarked, ExternalLink, MoreHorizontal, X } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import type { SelectedRepository } from "@/ipc/bindings.types";
import { commandFor, keysFor } from "@/keyboard/shortcuts";

export function SidebarRepository({
  selected,
  warning,
  removing = false,
  onOpen,
  onRemove,
}: {
  selected: SelectedRepository;
  warning?: string;
  removing?: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const removeItem = useRef<HTMLDivElement>(null);
  const repository = selected.repository;
  const note = selected.unavailable
    ? "Unavailable with current access"
    : !repository.has_issues
      ? "Issues disabled"
      : repository.archived
        ? "Archived"
        : warning;
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.defaultPrevented && commandFor(event.nativeEvent, "sidebar") === "sidebar.hide") {
      event.preventDefault();
      if (!removing) {
        if (removeItem.current) {
          removeItem.current.click();
        } else {
          onRemove();
        }
      }
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group relative min-w-0 rounded-md"
          data-slot="sidebar-repository"
        >
          <a
            onKeyDown={onKeyDown}
            href={repository.url}
            title={`${repository.full_name} · Open on GitHub${note ? ` · ${note}` : ""}`}
            aria-label={`Open ${repository.full_name} on GitHub`}
            className="flex min-h-row min-w-0 items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 text-fg-2 hover:bg-hover focus-visible:shadow-ring"
            onClick={(event) => {
              event.preventDefault();
              onOpen();
            }}
          >
            <BookMarked
              aria-hidden
              className="size-3.5 shrink-0 text-fg-3"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{repository.full_name}</span>
              {note ? <span className="block text-fg-3 text-xs">{note}</span> : null}
            </span>
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onKeyDown={onKeyDown}
                aria-label={`Options for ${repository.full_name}`}
                disabled={removing}
                className="absolute top-1 right-1 size-5 text-fg-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onKeyDown={onKeyDown}>
              <DropdownMenuItem onSelect={onOpen}>
                <ExternalLink />
                Open on GitHub
              </DropdownMenuItem>
              <DropdownMenuItem
                ref={removeItem}
                onSelect={onRemove}
              >
                <X />
                Remove from sidebar<Kbd className="ml-auto">{keysFor("sidebar.hide").join("")}</Kbd>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onKeyDown={onKeyDown}>
        <ContextMenuItem onSelect={onOpen}>
          <ExternalLink />
          Open on GitHub
        </ContextMenuItem>
        <ContextMenuItem
          ref={removeItem}
          onSelect={onRemove}
        >
          <X />
          Remove from sidebar<Kbd className="ml-auto">{keysFor("sidebar.hide").join("")}</Kbd>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
