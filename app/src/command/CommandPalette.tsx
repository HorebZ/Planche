import { GitMerge } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { focusCard } from "@/board/Card";
import { statusTone } from "@/board/statusTone";
import {
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
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { StatusSquare } from "@/components/ui/status";
import type { Board, Card } from "@/ipc/bindings.types";
import { commandFor, keysFor, type Scope } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { cardRef } from "@/undo/inverse";
import { matchCards, type PaletteCommand } from "./commands";

type CommandPaletteProps = {
  board: Board | null;
  /** The selected card, which the palette acts on until ⌫ clears it. */
  card: Card | null;
  commands: PaletteCommand[];
  onReveal: (id: string) => void;
};

/** Screen 4: ⌘K. Runs every action, and finds a card to select. */
export function CommandPalette({ board, card, commands, onReveal }: CommandPaletteProps) {
  const scopeId = useId();
  const open = useUi((s) => s.overlay?.type === "palette");
  const inDetail = useUi((s) => s.detailId !== null || s.activeIssueTab !== null);
  const [query, setQuery] = useState("");
  const [withContext, setWithContext] = useState(true);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setWithContext(true);
    pending.current = null;
  }, [open]);

  const target = withContext ? card : null;
  const targetColumn = board?.columns.find((column) =>
    column.cards.some((item) => item.item_id === target?.item_id),
  );
  const ref = target ? cardRef(target) : "";
  const shown = commands.filter((c) => c.group === "commands" || target);
  const cards = matchCards(board, query);
  const close = () => useUi.getState().open(null);
  const run = (command: PaletteCommand) => {
    pending.current = command.run;
    close();
  };
  const keys = (command: Parameters<typeof keysFor>[0]) => keysFor(command, "palette");

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => useUi.getState().open(next ? { type: "palette" } : null)}
      contentProps={{
        onCloseAutoFocus: (event) => {
          event.preventDefault();

          // Release the dialog's focus trap before focusing an inline draft editor.
          const run = pending.current;
          pending.current = null;

          if (run) {
            run();

            return;
          }

          // The overlay that follows, such as the assignee picker, takes the focus instead.
          const { overlay, selectedId, detailId, issueTabs, activeIssueTab } = useUi.getState();
          const id =
            issueTabs.find((tab) => tab.id === activeIssueTab)?.itemId ?? detailId ?? selectedId;

          if (!overlay && id) {
            focusCard(id);
          }
        },
      }}
      commandProps={{
        onKeyDown: (event) => {
          if (query) {
            return;
          }

          const command = commandFor(event.nativeEvent, "palette");

          if (command === "palette.clearContext" && target) {
            event.preventDefault();
            setWithContext(false);
          } else if (command === "help.open") {
            event.preventDefault();
            useUi.getState().open({ type: "help" });
          }
        },
      }}
    >
      <CommandInput
        aria-describedby={scopeId}
        value={query}
        onValueChange={setQuery}
        placeholder={target ? "Run an action or search…" : "Search or run…"}
        trailing={<Kbd className="text-fg-3">esc</Kbd>}
      />
      {target ? (
        <div className="flex min-w-0 items-center gap-2 border-line border-b bg-bg px-4 py-2">
          <span className="shrink-0 text-fg-3 text-xs">Selected</span>
          <CommandContext>
            <StatusSquare
              status={
                target.kind === "draft"
                  ? "draft"
                  : statusTone(targetColumn?.color ?? null, targetColumn?.name)
              }
            />
            <span className="truncate">
              {ref} {target.kind === "redacted" ? "Redacted item" : target.title}
            </span>
          </CommandContext>
        </div>
      ) : null}
      <p
        id={scopeId}
        className="truncate px-4 pt-3 pb-1 text-fg-3 text-xs"
        title={board?.project.title}
      >
        {board
          ? `Loaded project: ${board.project.title} — search loaded items only`
          : "No project loaded"}
      </p>
      <CommandList>
        <CommandEmpty>No matches</CommandEmpty>
        {target ? (
          <CommandGroup heading="Change status">
            {shown
              .filter((c) => c.group === "status")
              .map((c) => (
                <PaletteRow
                  key={c.value}
                  command={c}
                  query={query}
                  shortcutScope={inDetail ? "detail" : undefined}
                  onRun={run}
                />
              ))}
          </CommandGroup>
        ) : null}
        <CommandGroup
          heading="Commands"
          className="mt-1"
        >
          {shown
            .filter((c) => c.group === "commands" || c.group === "card")
            .map((c) => (
              <PaletteRow
                key={c.value}
                command={c}
                query={query}
                shortcutScope={inDetail ? "detail" : undefined}
                onRun={run}
              />
            ))}
        </CommandGroup>
        {cards.length > 0 ? (
          <CommandGroup
            heading="Issues"
            className="mt-1"
          >
            {cards.map((c) => (
              <CardRow
                key={c.item_id}
                card={c}
                board={board as Board}
                query={query}
                onPick={() => {
                  close();
                  onReveal(c.item_id);
                }}
              />
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      <CommandFooter>
        <CommandHint keys={[...keys("palette.prev"), ...keys("palette.next")]}>
          Navigate
        </CommandHint>
        <CommandHint keys={keys("palette.run")}>Apply</CommandHint>
        {target ? (
          <CommandHint keys={keys("palette.clearContext")}>Clear context</CommandHint>
        ) : null}
        <span className="flex-1" />
        <CommandHint keys={keysFor("dialog.close")}>Close</CommandHint>
      </CommandFooter>
    </CommandDialog>
  );
}

function PaletteRow({
  command,
  query,
  shortcutScope,
  onRun,
}: {
  command: PaletteCommand;
  query: string;
  shortcutScope?: Scope;
  onRun: (command: PaletteCommand) => void;
}) {
  const Icon = command.icon;
  const shortcut = command.shortcut ? keysFor(command.shortcut, shortcutScope) : [];

  return (
    <CommandItem
      value={command.value}
      onSelect={() => onRun(command)}
    >
      {command.status ? (
        <StatusSquare status={command.status} />
      ) : (
        <Icon className="size-[18px] text-fg-3" />
      )}
      <span className="min-w-0 flex-1 truncate">
        <CommandHighlight
          text={command.label}
          query={query}
        />
      </span>
      {command.current ? (
        <span className="rounded-sm bg-hover px-1.5 py-0.5 text-fg-3 text-xs">Current</span>
      ) : null}
      {shortcut.length ? (
        <CommandShortcut>
          {shortcut.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  );
}

function CardRow({
  card,
  board,
  query,
  onPick,
}: {
  card: Card;
  board: Board;
  query: string;
  onPick: () => void;
}) {
  const column = board.columns.find((c) => c.cards.some((x) => x.item_id === card.item_id));
  const title = card.kind === "redacted" ? "Redacted item" : card.title;
  const where =
    "number" in card ? `${card.repo.slice(card.repo.indexOf("/") + 1)}#${card.number}` : "draft";

  return (
    <CommandItem
      value={`${title} ${where} ${card.item_id}`}
      onSelect={onPick}
    >
      <span className="grid w-[18px] place-items-center">
        {card.kind === "pull_request" ? (
          <GitMerge className="size-4 text-fg-3" />
        ) : (
          <span className="size-[11px] rounded-xs shadow-[inset_0_0_0_1.5px_var(--pl-fg-3)]" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <CommandHighlight
          text={title}
          query={query}
        />
      </span>
      <span className="shrink-0 text-fg-3 text-xs tabular-nums">{where}</span>
      {column ? (
        <span className="inline-flex h-4 items-center gap-1 rounded-xs bg-hover px-[5px] text-2xs text-fg-2">
          <StatusSquare
            status={statusTone(column.color, column.name)}
            className="size-1.5"
          />
          {column.name}
        </span>
      ) : null}
    </CommandItem>
  );
}
