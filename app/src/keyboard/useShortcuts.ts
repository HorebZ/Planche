import { useEffect, useRef } from "react";
import { useUi } from "@/stores/ui";
import { type CommandId, commandFor, isTextField } from "./shortcuts";

export type Handlers = Partial<Record<CommandId, () => void>>;

/**
 * Runs the `global` and `board` shortcuts of the table. They stay silent in a text field, while
 * an overlay is open (it handles its own keys), and while a card is lifted.
 */
export function useShortcuts(handlers: Handlers, detail?: boolean) {
  const latest = useRef(handlers);
  const context = useRef(detail);
  context.current = detail;

  latest.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { overlay, dragging, detailId, activeIssueTab, linkedIssue } = useUi.getState();
      const inDetail =
        Boolean(linkedIssue) || (context.current ?? (detailId !== null || activeIssueTab !== null));

      if (event.defaultPrevented || overlay || dragging || isTextField(event.target)) {
        return;
      }

      if (document.querySelector('[role="dialog"], [role="menu"], [data-slot="popover-content"]')) {
        return;
      }

      const global = commandFor(event, "global");
      const target = event.target instanceof HTMLElement ? event.target : null;

      if (
        !global &&
        !inDetail &&
        target?.closest('button, [data-slot="sidebar"]') &&
        !target.closest("[data-item-id]")
      ) {
        return;
      }

      const command = inDetail
        ? commandFor(event, "detail")
        : (global ?? commandFor(event, "board"));

      if (linkedIssue) {
        if (command === "detail.close" || command === "tab.close") {
          event.preventDefault();
          useUi.getState().setLinkedIssue(null);
          return;
        }

        // The collection's action handlers still address the source issue.
        if (command !== "card.github") {
          return;
        }
      }

      const run = command && latest.current[command];

      if (!run) {
        return;
      }

      event.preventDefault();
      run();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
