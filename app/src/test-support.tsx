import { QueryClientProvider } from "@tanstack/react-query";
import { clearMocks } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { calls, installMockBackend } from "./ipc/_fixtures/backend.fixtures";
import { createQueryClient, queryClient } from "./ipc/queries";
import { useDrafts } from "./stores/drafts";
import { usePreferences } from "./stores/preferences";
import { useUi } from "./stores/ui";

export { calls, installMockBackend };

const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  useUi.setState(useUi.getInitialState());
  useDrafts.setState(useDrafts.getInitialState());
  usePreferences.setState(usePreferences.getInitialState());
  queryClient.clear();
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup();
  }

  queryClient.clear();
  await Promise.resolve();
  clearMocks();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-theme");
});

export function render(children: ReactNode, client = createQueryClient()) {
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.append(container);
  flushSync(() =>
    root.render(<QueryClientProvider client={client}>{children}</QueryClientProvider>),
  );
  cleanups.push(() => {
    flushSync(() => root.unmount());
    container.remove();
    client.clear();
  });

  return { container, client };
}

export function get<T extends HTMLElement = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
) {
  const element = scope.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

export function button(name: string, scope: ParentNode = document) {
  const element = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => (button.getAttribute("aria-label") ?? button.textContent?.trim()) === name,
  );

  if (!element) {
    throw new Error(`Missing button: ${name}`);
  }

  return element;
}

export function click(element: HTMLElement) {
  flushSync(() => element.click());
}

export function fill(input: HTMLInputElement, value: string) {
  // Bypass React's value tracker, as a browser edit does.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

export function submit(input: HTMLInputElement) {
  flushSync(() =>
    input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

export function key(key: string, target: EventTarget = document, options: KeyboardEventInit = {}) {
  return flushSync(() =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
    ),
  );
}
