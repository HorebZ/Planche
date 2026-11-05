import { Bookmark, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export function RepositoryShortcut({
  name,
  pending = false,
  onOpen,
  onRename,
  onDuplicate,
  onRemove,
}: {
  name: string;
  pending?: boolean;
  onOpen: () => void;
  onRename: (name: string) => Promise<boolean>;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const beginRename = () => {
    finished.current = false;
    setValue(name);
    setEditing(true);
  };
  const finish = async (save: boolean) => {
    if (finished.current || pending) {
      return;
    }
    finished.current = true;
    if (!save || value.trim() === name || (await onRename(value))) {
      setEditing(false);
    } else {
      finished.current = false;
      requestAnimationFrame(() => input.current?.focus());
    }
  };

  useEffect(() => {
    if (editing) {
      const frame = requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [editing]);

  return (
    <div
      className="group flex min-w-0 items-center gap-1 pl-5"
      data-slot="repository-shortcut"
    >
      {editing ? (
        <Input
          ref={input}
          className="h-6 min-w-0 flex-1"
          aria-label={`Rename filter ${name}`}
          value={value}
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void finish(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              void finish(event.key === "Enter");
            }
          }}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 flex-1 justify-start text-fg-2"
          disabled={pending}
          onClick={onOpen}
          onDoubleClick={beginRename}
        >
          <Bookmark />
          <span className="truncate">{name}</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 text-fg-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Options for filter ${name}`}
            disabled={pending}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            if (input.current) {
              event.preventDefault();
            }
          }}
        >
          <DropdownMenuItem
            onSelect={beginRename}
            disabled={pending}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDuplicate}
            disabled={pending}
          >
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onRemove}
            disabled={pending}
            variant="destructive"
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
