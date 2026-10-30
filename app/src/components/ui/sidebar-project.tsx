import { ExternalLink, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type ProjectTone, projectTones, SidebarItem } from "@/components/ui/sidebar";
import { commandFor, keysFor } from "@/keyboard/shortcuts";
import { cn } from "@/lib/cn";

const colors: { tone: ProjectTone; name: string }[] = [
  { tone: "danger", name: "Red" },
  { tone: "accent", name: "Orange" },
  { tone: "doing", name: "Yellow" },
  { tone: "lime", name: "Lime" },
  { tone: "done", name: "Green" },
  { tone: "teal", name: "Teal" },
  { tone: "cyan", name: "Cyan" },
  { tone: "blue", name: "Blue" },
  { tone: "indigo", name: "Indigo" },
  { tone: "review", name: "Purple" },
  { tone: "pink", name: "Pink" },
  { tone: "todo", name: "Gray" },
];

export function SidebarProject({
  name,
  tone,
  active,
  count,
  hidden,
  onOpen,
  onOpenGitHub,
  onHide,
  onToneChange,
}: {
  name: string;
  tone: ProjectTone;
  active: boolean;
  count?: number;
  hidden: boolean;
  onOpen: () => void;
  onOpenGitHub: () => void;
  onHide: () => void;
  onToneChange: (tone: ProjectTone) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={`group relative rounded-md ${hidden ? "opacity-55" : ""}`}>
          <SidebarItem
            name={name}
            tone={tone}
            active={active}
            count={count}
            onClick={onOpen}
            onKeyDown={(event) => {
              if (commandFor(event.nativeEvent, "sidebar") === "sidebar.hide") {
                event.preventDefault();
                onHide();
              }
            }}
            className="pr-8 [&>span:last-child:not(:nth-child(2))]:group-hover:invisible"
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Change color for ${name}`}
                className="absolute top-0.5 left-[3px] size-6 rounded-sm"
              />
            </PopoverTrigger>
            <PopoverContent
              aria-label={`Color for ${name}`}
              className="w-auto p-2"
            >
              <div className="grid grid-cols-4 gap-1">
                {colors.map((color) => (
                  <PopoverClose
                    key={color.tone}
                    asChild
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={color.name}
                      aria-pressed={(tone === "backlog" ? "todo" : tone) === color.tone}
                      className={cn(
                        "size-7 rounded-md p-1",
                        (tone === "backlog" ? "todo" : tone) === color.tone &&
                          "bg-active shadow-[inset_0_0_0_1px_var(--pl-border-strong)]",
                      )}
                      onClick={() => onToneChange(color.tone)}
                    >
                      <span
                        aria-hidden
                        className={`size-4 rounded-sm ${projectTones[color.tone]}`}
                      />
                    </Button>
                  </PopoverClose>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {hidden ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Show ${name} in sidebar`}
              onClick={onHide}
              className="absolute top-[3px] right-1 size-[22px] text-fg-3"
            >
              <Eye className="size-3.5" />
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`More options for ${name}`}
                  className="absolute top-[3px] right-1 size-[22px] text-fg-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:bg-active data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={onOpen}>
                  Open<Kbd className="ml-auto">↵</Kbd>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenGitHub}>
                  <ExternalLink />
                  Open on GitHub
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onHide}>
                  <EyeOff />
                  Hide from sidebar<Kbd className="ml-auto">{keysFor("sidebar.hide").join("")}</Kbd>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>
          Open<Kbd className="ml-auto">↵</Kbd>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onOpenGitHub}>
          <ExternalLink />
          Open on GitHub
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onHide}>
          {hidden ? <Eye /> : <EyeOff />}
          {hidden ? "Show in sidebar" : "Hide from sidebar"}
          <Kbd className="ml-auto">{keysFor("sidebar.hide").join("")}</Kbd>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
