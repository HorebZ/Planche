/**
 * A fake Rust backend for the browser. `bun run dev` loads it when the URL has `?mock=<scenario>`,
 * so Playwright renders the app without Tauri. The data is the mockup's.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { applyIntent } from "../../board/moveCard";
import type {
  AppError,
  AuthStatus,
  Board,
  CommentSubmission,
  Intent,
  IssueActivity,
  IssueDescription,
  IssueIntent,
  ProjectList,
  ProjectMeta,
  RepositoryIssueFilter,
  RepositoryIssueShortcut,
  RepositoryIssues,
  SelectedRepository,
  SyncPrefs,
} from "../bindings.types";
import { issueActivity } from "./activity.fixtures";
import { issueDescription, MARKDOWN_BODY } from "./description.fixtures";
import { issueRecord } from "./issue.fixtures";
import { repository } from "./repository.fixtures";
import {
  repositoryIssueOptions,
  repositoryIssueSource,
  repositoryIssues,
} from "./repository-issues.fixtures";
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
import { updateStatus } from "./update.fixtures";
import { user } from "./user.fixtures";

/** Counts calls per command, for tests that check a refetch. */
export const calls: Record<string, number> = {};

export function installMockBackend(scenario: Scenario) {
  for (const command of Object.keys(calls)) {
    delete calls[command];
  }

  mockWindows("main");

  const repositoryMetadata = [
    repository(),
    repository({
      id: "R_disabled",
      full_name: "HorebZ/disabled",
      url: "https://github.com/HorebZ/disabled",
      has_issues: false,
    }),
    repository({
      id: "R_second",
      full_name: "HorebZ/second-page",
      url: "https://github.com/HorebZ/second-page",
    }),
    repository({
      id: "R_archived",
      full_name: "HorebZ/archived",
      url: "https://github.com/HorebZ/archived",
      archived: true,
    }),
    repository({
      id: "R_org",
      full_name: "planche/core",
      url: "https://github.com/planche/core",
      owner_is_org: true,
    }),
    repository({
      id: "R_external",
      full_name: "external/public",
      url: "https://github.com/external/public",
      owner_is_org: true,
    }),
  ];
  const repositoryKey = (account: unknown) => `planche:mock:repositories:${account}`;
  const selectedRepositories = (account: unknown): SelectedRepository[] =>
    JSON.parse(sessionStorage.getItem(repositoryKey(account)) ?? "[]");
  const saveRepositories = (account: unknown, selected: SelectedRepository[]) => {
    sessionStorage.setItem(repositoryKey(account), JSON.stringify(selected));

    return structuredClone(selected);
  };
  let repositoryOffline = scenario === "offline";
  const repositorySource = repositoryIssueSource();
  const issueCacheKey = (args: Record<string, unknown>) =>
    `planche:mock:repository-issues:${args.account}:${args.id}:${JSON.stringify(args.filter)}`;
  const shortcutKey = (args: Record<string, unknown>) =>
    `planche:mock:repository-shortcuts:${args.account}:${args.id}`;
  const savedShortcuts = (args: Record<string, unknown>): RepositoryIssueShortcut[] =>
    JSON.parse(sessionStorage.getItem(shortcutKey(args)) ?? "[]");
  const savedIssues = (args: Record<string, unknown>): RepositoryIssues | null =>
    JSON.parse(sessionStorage.getItem(issueCacheKey(args)) ?? "null");
  let prefs: SyncPrefs = { interval: "five_minutes", on_wake: true };
  let auth = structuredClone(onboarding(scenario) ? signedOut : signedIn);
  const savedAccounts = new Map<string, AuthStatus>();
  if (auth.id) {
    savedAccounts.set(auth.id, structuredClone(auth));
  }
  if (scenario === "accounts") {
    savedAccounts.set("U_WORK", {
      ...structuredClone(signedIn),
      id: "U_WORK",
      login: "camille-work",
      mode: "oauth",
    });
  }
  let board = boardFor(scenario);
  const boards = new Map<string, Board>();
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
  const changed = (project = PROJECT) => emit("board-changed", { project_id: project });
  let dispatchSeq = 0;
  const comments = new Map<string, CommentSubmission[]>();
  const commentSequences = new Map<string, number>();
  const activities = new Map<string, IssueActivity>();
  let failNextComment = false;
  const issueFor = (content: string) =>
    issueRecord({
      content:
        board?.columns
          .flatMap((column) => column.cards)
          .find((card) => card.kind === "issue" && card.id === content) ??
        repositorySource.find(({ issue }) => issue.id === content)?.issue ??
        issueRecord().content,
    });
  const descriptions = new Map<string, IssueDescription>();
  let descriptionError = scenario === "description-error";
  let descriptionDenied = scenario === "description-denied";
  let unlock: (() => void) | undefined;
  let oauthActive = false;
  let organizationsActive = false;
  let update = updateStatus();
  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    check_updates: () => update,
    download_update: async () => {
      update = { ...update, phase: "downloading", received: 1024, total: 2048 };
      await emit("update-changed", update);
      update = { ...update, phase: "ready", received: 2048 };
      await emit("update-changed", update);

      return update;
    },
    install_update: () => null,
    auth_oauth_start: () => {
      oauthActive = true;
      organizationsActive = false;

      return { user_code: "ABCD-EFGH", interval: 1 };
    },
    auth_organizations_start: () => {
      oauthActive = true;
      organizationsActive = true;

      return { user_code: "ABCD-EFGH", interval: 1 };
    },
    auth_oauth_copy_code: () => {
      if (scenario === "oauth-copy-error") {
        throw {
          kind: "Auth",
          message: "Could not copy the code. Select and copy it manually.",
        } satisfies AppError;
      }

      return null;
    },
    auth_oauth_poll: () => {
      if (!oauthActive || scenario === "oauth-denied") {
        throw {
          kind: "Auth",
          message: "GitHub sign-in: authorization was declined; start sign-in again",
        } satisfies AppError;
      }

      if (scenario === "oauth-waiting") {
        return null;
      }
      auth = {
        ...structuredClone(signedIn),
        ...(scenario === "accounts" && !organizationsActive
          ? { id: "U_ADDED", login: "camille-added" }
          : {}),
        mode: "oauth",
        organizations_connected: organizationsActive,
      };

      if (auth.id) {
        savedAccounts.set(auth.id, structuredClone(auth));
      }
      return auth;
    },
    auth_oauth_cancel: () => {
      oauthActive = false;

      return null;
    },
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

      auth =
        scenario === "accounts"
          ? { ...structuredClone(signedIn), id: "U_ADDED", login: "camille-added" }
          : structuredClone(signedIn);
      if (auth.id) {
        savedAccounts.set(auth.id, structuredClone(auth));
      }

      return auth;
    },
    auth_accounts: () =>
      [...savedAccounts.values()].map((saved) => ({
        id: saved.id,
        login: saved.login,
        avatar_url: saved.avatar_url,
        mode: saved.mode,
        active: saved.id === auth.id,
      })),
    auth_switch_account: (args) => {
      const saved = savedAccounts.get(String(args.id));
      if (!saved) {
        throw { kind: "Auth", message: "Account is no longer saved" } satisfies AppError;
      }
      auth = structuredClone(saved);
      return auth;
    },
    auth_sign_out: () => {
      if (auth.id) {
        savedAccounts.delete(auth.id);
      }
      auth = structuredClone(savedAccounts.values().next().value ?? signedOut);

      return null;
    },
    list_projects: () => {
      if (projectError) {
        throw { kind: "GitHub", message: "Projects are inaccessible (403)" } satisfies AppError;
      }

      return projectList;
    },
    cached_projects: () => projectList,
    cached_repositories: (args) => selectedRepositories(args.account),
    repository_catalog: (args) => {
      if (scenario === "offline") {
        throw { kind: "Network", message: "Network unreachable" } satisfies AppError;
      }
      const filtered = repositoryMetadata.filter(
        (repository) =>
          repository.id !== "R_external" &&
          repository.owner_is_org === (args.source === "organizations") &&
          repository.full_name.toLowerCase().includes(String(args.search).toLowerCase()),
      );
      const start = args.after ? Number(args.after) : 0;

      return {
        repositories: structuredClone(filtered.slice(start, start + 2)),
        next_cursor: start + 2 < filtered.length ? String(start + 2) : null,
      };
    },
    select_repository: (args) => {
      if (scenario === "offline") {
        throw { kind: "Network", message: "Network unreachable" } satisfies AppError;
      }
      const reference = String(args.reference)
        .trim()
        .replace(/^https:\/\/github\.com\//, "")
        .replace(/\/$/, "");
      const repository = repositoryMetadata.find(
        (repository) => repository.full_name.toLowerCase() === reference.toLowerCase(),
      );
      if (!repository?.has_issues) {
        throw {
          kind: "Invalid",
          message: repository
            ? "Issues are disabled for this repository."
            : "Repository unavailable with your current GitHub access.",
        } satisfies AppError;
      }
      const selected = selectedRepositories(args.account);

      return saveRepositories(args.account, [
        ...selected.filter((saved) => saved.repository.id !== repository.id),
        { repository, unavailable: false },
      ]);
    },
    remove_repository: (args) =>
      saveRepositories(
        args.account,
        selectedRepositories(args.account).filter((saved) => saved.repository.id !== args.id),
      ),
    refresh_repository: (args) => {
      if (scenario === "offline") {
        throw { kind: "Network", message: "Network unreachable" } satisfies AppError;
      }
      const selected = selectedRepositories(args.account);
      const saved = selected.find((saved) => saved.repository.id === args.id);
      if (!saved) {
        return null;
      }
      const repository = repositoryMetadata.find((repository) => repository.id === args.id);
      const refreshed = repository
        ? { repository, unavailable: false }
        : { ...saved, unavailable: true };
      saveRepositories(
        args.account,
        selected.map((saved) => (saved.repository.id === args.id ? refreshed : saved)),
      );

      return structuredClone(refreshed);
    },

    cached_repository_issues: (args) => savedIssues(args),
    refresh_repository_issues: (args) => {
      if (repositoryOffline) {
        return { kind: "offline", data: savedIssues(args) };
      }
      if (!repositoryMetadata.some((repository) => repository.id === args.id)) {
        sessionStorage.removeItem(issueCacheKey(args));
        return { kind: "unavailable" };
      }
      const filter = args.filter as RepositoryIssueFilter;
      const matches = repositorySource.filter(
        ({ issue, milestone }) =>
          (filter.state === "all" || filter.state === issue.state) &&
          (filter.milestone === null || filter.milestone === milestone) &&
          (!filter.labels.length ||
            issue.labels.some((label) => filter.labels.includes(label.name))),
      );
      const start = args.after ? Number(args.after) : 0;
      const end = Math.min(start + 50, matches.length);
      const data = repositoryIssues({
        issues: [
          ...(start ? (savedIssues(args)?.issues ?? []) : []),
          ...matches.slice(start, end).map(({ issue }) => issue),
        ],
        next_cursor: end < matches.length ? String(end) : null,
        complete: end === matches.length,
      });
      sessionStorage.setItem(issueCacheKey(args), JSON.stringify(data));
      return { kind: "ready", data };
    },
    cached_repository_issue_options: () => repositoryIssueOptions(),
    refresh_repository_issue_options: () => repositoryIssueOptions(),
    repository_issue_shortcuts: (args) => savedShortcuts(args),
    save_repository_issue_shortcut: (args) => {
      const name = String(args.name).trim();
      const existing = savedShortcuts(args);
      const shortcut = {
        id:
          existing.find((shortcut) => shortcut.name.toLowerCase() === name.toLowerCase())?.id ??
          crypto.randomUUID(),
        name,
        filter: args.filter as RepositoryIssueFilter,
      };
      const result = [...existing.filter((item) => item.id !== shortcut.id), shortcut];
      sessionStorage.setItem(shortcutKey(args), JSON.stringify(result));
      return structuredClone(result);
    },
    delete_repository_issue_shortcut: (args) => {
      const result = savedShortcuts(args).filter((shortcut) => shortcut.id !== args.shortcut);
      sessionStorage.setItem(shortcutKey(args), JSON.stringify(result));
      return result;
    },

    open_project: () => null,
    current_project: () =>
      onboarding(scenario) || scenario.startsWith("projects-") ? null : PROJECT,
    get_project: (args): ProjectMeta => ({
      id: String(args.projectId),
      number: 1,
      title: boards.get(String(args.projectId))?.project.title ?? "Planche — v1.2",
      url: "",
      owner: "planche",
      owner_is_org: true,
      can_update: scenario !== "readonly-project",
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

      const source = boards.get(String(args.projectId)) ?? board;

      return source && args.viewId === "PVTV_2"
        ? { ...source, view: { number: 2, name: "Planning", manual_order: true } }
        : source;
    },
    cached_issue: (args) => (descriptionDenied ? null : issueFor(String(args.content))),
    refresh_issue: (args) =>
      descriptionDenied
        ? { status: "unavailable" }
        : {
            status: scenario === "offline" ? "offline" : "ready",
            issue: issueFor(String(args.content)),
          },
    cached_issue_comments: (args) =>
      structuredClone(comments.get(`${args.account}:${args.content}`) ?? []),
    dispatch_issue_intent: (args) => {
      const intent = args.intent as IssueIntent;
      if (intent.type === "update_body") {
        if (descriptionDenied || !issueFor(intent.content_id).permissions?.update) {
          return { type: "rejected", error: { kind: "Invalid", message: "Editing unavailable" } };
        }

        const key = `${args.account}:${intent.content_id}`;
        const description = issueDescription({ body: intent.body, pending: true });
        descriptions.set(key, description);
        void emit("issue-changed", {
          account: args.account,
          content: intent.content_id,
          error: null,
        });

        if (scenario !== "offline") {
          setTimeout(() => {
            if (auth.id !== args.account) {
              return;
            }

            descriptions.set(key, { ...description, pending: false });
            void emit("issue-changed", {
              account: args.account,
              content: intent.content_id,
              error: null,
            });
          }, 300);
        }

        return { type: "accepted", seq: ++dispatchSeq };
      }

      if (intent.type !== "add_comment" || !intent.body.trim() || descriptionDenied) {
        return { type: "rejected", error: { kind: "Invalid", message: "Commenting unavailable" } };
      }
      const key = `${args.account}:${intent.content_id}`;
      const submissions = comments.get(key) ?? [];
      const existing = submissions.find((comment) => comment.request_id === intent.request_id);
      if (existing && existing.status !== "failed") {
        return { type: "accepted", seq: commentSequences.get(intent.request_id) };
      }
      const comment: CommentSubmission = {
        request_id: intent.request_id,
        body: intent.body,
        status: "queued",
        error: null,
        entry: null,
      };
      comments.set(key, [
        ...submissions.filter((saved) => saved.request_id !== intent.request_id),
        comment,
      ]);
      const seq = ++dispatchSeq;
      commentSequences.set(intent.request_id, seq);
      void emit("issue-changed", {
        account: args.account,
        content: intent.content_id,
        error: null,
      });
      if (scenario !== "offline") {
        const refused = failNextComment;
        failNextComment = false;
        setTimeout(async () => {
          if (auth.id !== args.account) {
            return;
          }
          comment.status = refused ? "failed" : "sent";
          comment.error = refused ? "GitHub refused this comment. Your text is saved." : null;
          if (!refused) {
            const activity = activities.get(key) ?? issueActivity();
            comment.entry = {
              id: `IC_${intent.request_id}`,
              kind: "comment",
              author: auth.login,
              created_at: new Date().toISOString(),
              body: intent.body,
              subject: null,
            };
            activities.set(key, { ...activity, entries: [...activity.entries, comment.entry] });
          }
          await emit("issue-changed", {
            account: args.account,
            content: intent.content_id,
            error: comment.error,
          });
        }, 300);
      }
      return { type: "accepted", seq };
    },
    cached_issue_description: (args) =>
      descriptions.get(`${args.account}:${args.content}`) ??
      (scenario === "offline" ? issueDescription() : null),
    cached_issue_activity: (args) =>
      activities.get(`${args.account}:${args.content}`) ??
      (scenario === "offline" ? issueActivity() : null),
    refresh_issue_activity: (args) => {
      if (descriptionDenied) {
        return null;
      }

      return activities.get(`${args.account}:${args.content}`) ?? issueActivity();
    },
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

      const description =
        descriptions.get(key) ??
        issueDescription({
          body:
            scenario === "markdown"
              ? MARKDOWN_BODY
              : `Description for ${args.content}\n\nDetails loaded on demand.`,
        });
      descriptions.set(key, description);

      return description;
    },
    // Queue locally before sending in the background.
    dispatch_intent: (args) => {
      const intent = args.intent as Intent;
      const before = boards.get(intent.project_id) ?? board;
      const save = (value: Board) => {
        if (boards.has(intent.project_id)) {
          boards.set(intent.project_id, value);
        } else {
          board = value;
        }
      };

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

      save(pending(applyIntent(before, intent), true));

      if (scenario !== "offline") {
        setTimeout(
          async () => {
            if (scenario === "rollback") {
              save(before);
              await emit("mutation-failed", { intent, message: "PLANCHE_FAULT=fail_mutations" });
            } else {
              save(pending(boards.get(intent.project_id) ?? board ?? before, false));
            }

            await changed(intent.project_id);
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
    setRepositoryOffline: (offline: boolean) => {
      repositoryOffline = offline;
    },
    renameRepository: (id: string, fullName: string) => {
      const repository = repositoryMetadata.find((repository) => repository.id === id);
      if (repository) {
        repository.full_name = fullName;
        repository.url = `https://github.com/${fullName}`;
      }
    },
    removeRepositoryAccess: (id: string) => {
      const index = repositoryMetadata.findIndex((repository) => repository.id === id);
      if (index >= 0) {
        repositoryMetadata.splice(index, 1);
      }
    },
    failNextComment: () => {
      failNextComment = true;
    },
    offerUpdate: async () => {
      update = updateStatus({
        phase: "available",
        release: { version: "0.1.0-alpha.2", notes: "Alpha fixes and improvements." },
      });
      await emit("update-changed", update);
    },
    emit,
    calls,
    getBoard: (project = PROJECT) => boards.get(project) ?? board,
    setBoard: (value: Board) => boards.set(value.project.id, structuredClone(value)),
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
