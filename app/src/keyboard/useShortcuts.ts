import { useEffect, useRef } from "react";
import { useUi } from "@/stores/ui";
import { type CommandId, commandFor, isTextField } from "./shortcuts";

export type Handlers = Partial<Record<CommandId, () => void>>;

/**
 * Runs the `global` and `board` shortcuts of the table. They stay silent in a text field, while
 * an overlay is open (it handles its own keys), and while a card is lifted.
 */
export function useShortcuts(handlers: Handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { overlay, dragging } = useUi.getState();
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
        target?.closest('button, [data-slot="sidebar"]') &&
        !target.closest("[data-item-id]")
      ) {
        return;
      }
      const command = global ?? commandFor(event, "board");
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
