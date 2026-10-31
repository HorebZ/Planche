/**
 * A fake Rust backend for the browser. `bun run dev` loads it when the URL has `?mock=<scenario>`,
 * so Playwright renders the app without Tauri. The data is the mockup's.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { applyIntent } from "../../board/moveCard";
import type {
  AppError,
  Board,
  Intent,
  IssueDescription,
  ProjectList,
  ProjectMeta,
  SyncPrefs,
} from "../bindings.types";
import { issueDescription } from "./description.fixtures";
import {
  boardFor,
  mockupBoard,
  onboarding,
  PROJECT,
  people,
  projects,
  type Scenario,
  signedIn,
  signedOut,
  statusFor,
} from "./scenarios.fixtures";
import { user } from "./user.fixtures";

/** Counts calls per command, for tests that check a refetch. */
export const calls: Record<string, number> = {};

export function installMockBackend(scenario: Scenario) {
  for (const command of Object.keys(calls)) {
    delete calls[command];
  }

  mockWindows("main");

  let prefs: SyncPrefs = { interval: "five_minutes", on_wake: true };
  let auth = structuredClone(onboarding(scenario) ? signedOut : signedIn);
  let board = boardFor(scenario);
  let boardError = scenario === "board-error";
  let status = statusFor(scenario);
  let projectError = scenario === "projects-error" || scenario === "valid-projects-error";
  let projectList: ProjectList = structuredClone(
    scenario === "projects-empty" || projectError
      ? { owners: [], sso_blocked: [] }
      : scenario === "projects-sso"
        ? { owners: [], sso_blocked: ["acme-sso"] }
        : scenario === "projects-partial-sso"
          ? { ...projects, sso_blocked: ["acme-sso"] }
          : projects,
  );
  const changed = () => emit("board-changed", { project_id: PROJECT });
  let dispatchSeq = 0;
  const descriptions = new Map<string, IssueDescription>();
  let descriptionError = scenario === "description-error";
  let descriptionDenied = scenario === "description-denied";
  let unlock: (() => void) | undefined;
  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    auth_status: async () => {
      if (scenario === "locked") {
        await new Promise<void>((resolve) => {
          unlock = resolve;
        });
      }

      if (scenario === "unlock-cancelled" && calls.auth_status === 1) {
        throw {
          kind: "Auth",
          message: "Authentication cancelled. Try again when you're ready.",
        } satisfies AppError;
      }

      return auth;
    },
    auth_set_token: async (args) => {
      if (scenario === "checking") {
        return new Promise(() => {});
      }

      await new Promise((resolve) => setTimeout(resolve, 600));

      if (scenario === "invalid" && args.token === "ghp_wrong") {
        throw { kind: "Auth", message: "token rejected by GitHub (401)" } satisfies AppError;
      }

      auth = structuredClone(signedIn);

      return auth;
    },
    auth_sign_out: () => {
      auth = structuredClone(signedOut);

      return null;
    },
    list_projects: () => {
      if (projectError) {
        throw { kind: "GitHub", message: "Projects are inaccessible (403)" } satisfies AppError;
      }

      return projectList;
    },
    cached_projects: () => projectList,
    open_project: () => null,
    current_project: () =>
      onboarding(scenario) || scenario.startsWith("projects-") ? null : PROJECT,
    get_project: (): ProjectMeta => ({
      id: PROJECT,
      number: 1,
      title: "Planche — v1.2",
      url: "",
      owner: "planche",
      owner_is_org: true,
      updated_at: "",
      fields: [],
      views: [
        {
          id: "PVTV_1",
          number: 1,
          name: "Board",
          layout: "Board",
          filter: null,
          group_by: null,
          manual_order: true,
        },
        {
          id: "PVTV_2",
          number: 2,
          name: "Planning",
          layout: "Board",
          filter: null,
          group_by: null,
          manual_order: true,
        },
      ],
    }),
    get_board: (args) => {
      if (boardError) {
        throw { kind: "Cache", message: "Could not read the local cache" } satisfies AppError;
      }

      return board && args.viewId === "PVTV_2"
        ? { ...board, view: { number: 2, name: "Planning", manual_order: true } }
        : board;
    },
    cached_issue_description: (args) =>
      scenario === "offline"
        ? issueDescription()
        : (descriptions.get(`${args.account}:${args.content}`) ?? null),
    refresh_issue_description: async (args) => {
      const key = `${args.account}:${args.content}`;

      if (scenario === "description-loading") {
        return new Promise(() => {});
      }

      if (scenario === "offline" || descriptionError) {
        throw {
          kind: scenario === "offline" ? "Network" : "GitHub",
          message: "Description request failed",
        } satisfies AppError;
      }

      if (descriptionDenied) {
        descriptions.delete(key);

        return null;
      }

      const description = issueDescription({
        body: `Description for ${args.content}\n\nDetails loaded on demand.`,
      });
      descriptions.set(key, description);

      return description;
    },
    // Queue locally before sending in the background.
    dispatch_intent: (args) => {
      const intent = args.intent as Intent;
      const before = board;

      if (!before) {
        throw new Error("mockBackend: no board to move a card on");
      }

      const pending = (b: Board, value: boolean): Board => ({
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          cards: c.cards.map((card) =>
            card.item_id === intent.item_id ? { ...card, pending: value } : card,
          ),
        })),
      });

      board = pending(applyIntent(before, intent), true);

      if (scenario !== "offline") {
        setTimeout(
          async () => {
            if (scenario === "rollback") {
              board = before;
              await emit("mutation-failed", { intent, message: "PLANCHE_FAULT=fail_mutations" });
            } else {
              board = pending(board ?? before, false);
            }

            await changed();
            // A refused move fails at once, like PLANCHE_FAULT=fail_mutations; an accepted one takes a moment.
          },
          scenario === "rollback" ? 0 : 300,
        );
      }

      return { type: "accepted", seq: ++dispatchSeq };
    },
    list_assignable_users: () =>
      Object.entries(people).map(([who, login]) => user({ id: `U_${who}`, login })),
    refresh_project: async () => {
      if (scenario === "refresh-error" && calls.refresh_project === 1) {
        throw { kind: "Network", message: "Could not start synchronization" } satisfies AppError;
      }

      if (
        ["sync-error", "rate-limited", "uncached-sync-error", "refresh-error"].includes(scenario)
      ) {
        status = { ...status, state: { type: "idle" }, retry_at: null, last_sync_at: Date.now() };
        board ??= mockupBoard();
        await emit("sync-status", status);
        await changed();
      }

      return { project: PROJECT, items: 17, cost: 4, usage: {}, changes: [] };
    },
    sync_status: () => status,
    get_sync_prefs: () => prefs,
    set_sync_prefs: (args) => {
      prefs = args.prefs as SyncPrefs;

      return prefs;
    },
    perf_mark: () => null,
  };

  mockIPC(
    (cmd, args) => {
      calls[cmd] = (calls[cmd] ?? 0) + 1;

      // Window and opener plugin calls succeed without effect.
      if (cmd.startsWith("plugin:")) {
        return null;
      }

      const handler = handlers[cmd];

      if (!handler) {
        throw new Error(`mockBackend: no handler for ${cmd}`);
      }

      return handler((args ?? {}) as Record<string, unknown>);
    },
    { shouldMockEvents: true },
  );
  const backend = {
    emit,
    calls,
    getBoard: () => board,
    restoreDescriptions: () => {
      descriptionError = false;
    },
    denyDescriptions: () => {
      descriptionDenied = true;
    },
    unlock: () => unlock?.(),
    setBoardError: (fail: boolean) => {
      boardError = fail;
    },
    restoreProjects: () => {
      projectError = false;
      projectList = structuredClone(projects);
    },
  };

  Object.assign(window, { __planche: backend });

  return backend;
}
