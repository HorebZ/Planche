import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";

function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-window bg-elevated text-fg shadow-pop",
        className,
      )}
      {...props}
    />
  );
}

function CommandInput({
  className,
  leading,
  trailing,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input> & { leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex h-[50px] items-center gap-2.5 border-line border-b px-3.5">
      {leading ?? <Search className="size-4 shrink-0 text-fg-3" />}
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-[16px] leading-5 outline-none placeholder:text-fg-3 focus-visible:shadow-none",
          className,
        )}
        {...props}
      />
      {trailing}
    </div>
  );
}

/** The card the palette acts on, before the query, as its number. */
function CommandContext({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="command-context"
      className={cn(
        "flex h-[22px] min-w-0 max-w-[320px] shrink items-center gap-[5px] rounded-sm bg-hover px-[7px] font-semibold text-fg-2 text-sm",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px]">{children}</span>
    </span>
  );
}

/** Marks in `text` the letters of each word of `query`, in order, as cmdk matches them. */
function CommandHighlight({ text, query }: { text: string; query: string }) {
  const hit = new Array<boolean>(text.length).fill(false);
  const lower = text.toLowerCase();
  let from = 0;

  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const whole = lower.indexOf(word, from);
    const at = whole >= 0 ? [...word].map((_, i) => whole + i) : subsequence(lower, word, from);

    if (!at) {
      continue;
    }

    for (const i of at) {
      hit[i] = true;
    }

    from = (at.at(-1) ?? from) + 1;
  }

  const parts: ReactNode[] = [];

  for (let i = 0; i < text.length; ) {
    let j = i;

    while (j < text.length && hit[j] === hit[i]) {
      j++;
    }

    const part = text.slice(i, j);

    parts.push(
      hit[i] ? (
        <span
          key={i}
          className="rounded-[2px] bg-active font-semibold"
        >
          {part}
        </span>
      ) : (
        part
      ),
    );
    i = j;
  }

  return parts;
}

function subsequence(text: string, word: string, from: number) {
  const at: number[] = [];

  for (let i = from; i < text.length && at.length < word.length; i++) {
    if (text[i] === word[at.length]) {
      at.push(i);
    }
  }

  return at.length === word.length ? at : null;
}

function CommandFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="command-footer"
      className={cn(
        "flex h-[38px] items-center gap-4 border-line border-t bg-bg-sunken px-3.5 text-[11.5px] text-fg-3",
        className,
      )}
      {...props}
    />
  );
}

function CommandHint({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-[5px]">
      <Kbd>{keys}</Kbd>
      {children}
    </span>
  );
}

function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-[360px] overflow-y-auto p-1.5", className)}
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-fg-3 text-sm", className)}
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "flex flex-col gap-px overflow-hidden text-fg",
        "[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-[26px] [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:text-fg-3",
        className,
      )}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "flex h-[34px] cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-base outline-none",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:text-fg-3",
        "data-[preview~=hover]:bg-active data-[selected=true]:bg-active",
        "[&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto flex items-center gap-[3px]", className)}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1.5 my-1 h-px bg-line", className)}
      {...props}
    />
  );
}

function CommandDialog({
  children,
  commandProps,
  contentProps,
  ...props
}: ComponentProps<typeof Dialog> & {
  commandProps?: ComponentProps<typeof CommandPrimitive>;
  contentProps?: ComponentProps<typeof DialogContent>;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        {...contentProps}
        showClose={false}
        className="top-[120px] w-[640px] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-window bg-elevated p-0 shadow-pop"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search actions, issues, and pull requests.
        </DialogDescription>
        <Command
          className="rounded-none bg-transparent shadow-none"
          {...commandProps}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export {
  Command,
  CommandContext,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandHighlight,
  CommandHint,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
