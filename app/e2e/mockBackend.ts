/**
 * A fake Rust backend for the browser. `bun run dev` loads it when the URL has `?mock=<scenario>`,
 * so Playwright renders the app without Tauri. The data is the mockup's.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { moveCard } from "../src/board/moveCard";
import type {
	AppError,
	AuthStatus,
	Board,
	Card,
	Column,
	Intent,
	ProjectList,
	ProjectMeta,
	SyncPrefs,
	SyncStatus,
} from "../src/ipc/bindings";

export type Scenario =
	| "board"
	| "loading"
	| "syncing"
	| "empty"
	| "offline"
	| "onboarding"
	| "checking"
	| "valid"
	| "invalid"
	| "big"
	| "rollback"
	| "sorted";

const PROJECT = "PVT_planche";

const labelColors: Record<string, string> = {
	bug: "d73a4a",
	feature: "4a7fd4",
	perf: "d9a23b",
	design: "d65a92",
	keyboard: "2ea3a3",
	sync: "8a5cc7",
	site: "3f9e6b",
	api: "7d8590",
	dnd: "e07a3a",
};

const people: Record<string, string> = { CR: "camille-r", TM: "theo-m", LB: "lea-b", AM: "amina-m" };

let position = 0;

function card(
	number: number,
	title: string,
	repo: string,
	kind: "i" | "p" | "d",
	labels: string[],
	who?: string,
): Card {
	const common = {
		item_id: `PVTI_${number}`,
		position: position++,
		number,
		title,
		url: `https://github.com/planche/${repo}/issues/${number}`,
		repo: `planche/${repo}`,
		assignees: who ? [{ id: `U_${who}`, login: people[who], avatar_url: "" }] : [],
		labels: labels.map((name) => ({ name, color: labelColors[name] })),
		pending: false,
		updated_by_sync: false,
	};
	if (kind === "p") return { ...common, kind: "pull_request", id: `PR_${number}`, state: "open", is_draft: false };
	return { ...common, kind: "issue", id: `I_${number}`, state: kind === "d" ? "closed" : "open" };
}

function column(id: string, name: string, color: string, cards: Card[]): Column {
	return { option_id: id, name, color, cards };
}

function mockupBoard(): Board {
	position = 0;
	return {
		project: { id: PROJECT, number: 1, title: "Planche — v1.2", url: "https://github.com/orgs/planche/projects/1" },
		view: { number: 1, name: "Board", manual_order: true },
		field: { id: "PVTSSF_status", name: "Status" },
		columns: [
			column("backlog", "Backlog", "GRAY", [
				card(218, "Export board as Markdown", "app", "i", ["feature"]),
				card(214, "Shortcut to move a card to the next column", "app", "i", ["keyboard", "feature"], "CR"),
				card(209, "Disk cache for GraphQL responses", "sync", "i", ["perf"], "TM"),
				card(201, "Support Iteration fields", "sync", "i", ["api"]),
				card(198, "Paste an image into a comment", "app", "i", ["feature"]),
				card(193, "Remember the window size", "app", "i", []),
			]),
			column("todo", "Todo", "BLUE", [
				card(226, "Show linked PRs in issue detail", "app", "i", ["feature", "design"], "CR"),
				card(223, "Column counter ignores filtered cards", "app", "i", ["bug"], "LB"),
				card(219, "Pricing page: compare Solo and Team", "site", "i", ["site"], "AM"),
			]),
			column("doing", "In progress", "YELLOW", [
				card(231, "Drag and drop across columns with persisted order", "app", "i", ["feature", "dnd"], "CR"),
				card(232, "sync: exponential backoff on 502 errors", "sync", "p", ["sync"], "TM"),
				card(228, "Dark theme: label contrast", "app", "i", ["design"], "AM"),
			]),
			column("review", "In review", "PURPLE", [
				card(229, "Command palette: fuzzy search", "app", "p", ["feature"], "CR"),
				card(227, "Fix WebSocket memory leak", "sync", "p", ["bug"], "LB"),
			]),
			column("done", "Done", "GREEN", [
				card(220, "Onboarding: token validation", "app", "d", [], "CR"),
				card(215, "App icon and menu bar extra", "site", "d", ["design"], "AM"),
				card(211, "Settings: sync interval", "app", "d", [], "TM"),
			]),
		],
		pending_count: 0,
		synced_at: new Date(Date.now() - 150_000).toISOString(),
	};
}

/** 1000 cards over five columns, for the scroll budget. */
function bigBoard(): Board {
	const board = mockupBoard();
	position = 0;
	for (const [index, col] of board.columns.entries()) {
		col.cards = Array.from({ length: 200 }, (_, i) =>
			card(
				index * 1000 + i,
				`Synthetic card ${index * 200 + i} with a title long enough to wrap`,
				"app",
				"i",
				i % 3 ? ["feature"] : ["bug", "perf"],
				i % 4 ? "CR" : undefined,
			),
		);
	}
	return board;
}

function boardFor(scenario: Scenario): Board | null {
	switch (scenario) {
		case "loading":
			return null;
		case "big":
			return bigBoard();
		case "empty": {
			const board = mockupBoard();
			for (const col of board.columns) col.cards = [];
			return board;
		}
		case "syncing": {
			const board = mockupBoard();
			board.columns[1].cards[1].updated_by_sync = true;
			board.columns[3].cards[0].updated_by_sync = true;
			return board;
		}
		case "sorted": {
			const board = mockupBoard();
			if (board.view) board.view.manual_order = false;
			return board;
		}
		case "offline": {
			const board = mockupBoard();
			board.columns[2].cards[0].pending = true;
			board.pending_count = 1;
			return board;
		}
		default:
			return mockupBoard();
	}
}

const projects: ProjectList = {
	owners: [
		{
			login: "camille-r",
			is_org: false,
			projects: [{ id: "PVT_personal", number: 3, title: "Roadmap Q4", closed: false, url: "" }],
		},
		{
			login: "planche",
			is_org: true,
			projects: [
				{ id: PROJECT, number: 1, title: "Planche — v1.2", closed: false, url: "" },
				{ id: "PVT_api", number: 2, title: "API Gateway", closed: false, url: "" },
				{ id: "PVT_design", number: 4, title: "Design system", closed: false, url: "" },
				{ id: "PVT_docs", number: 5, title: "Docs & site", closed: false, url: "" },
			],
		},
	],
	sso_blocked: [],
};

function statusFor(scenario: Scenario): SyncStatus {
	const base = { last_sync_at: Date.now() - 150_000, retry_at: null, pending: 0 };
	switch (scenario) {
		case "loading":
			return { ...base, last_sync_at: null, state: { type: "syncing", page: 1, pages: 2, items_total: 142 } };
		case "syncing":
			return { ...base, state: { type: "syncing", page: 3, pages: 5, items_total: 480 } };
		case "offline":
			return { ...base, pending: 1, retry_at: Date.now() + 24_000, state: { type: "offline" } };
		default:
			return { ...base, state: { type: "idle" } };
	}
}

const signedIn: AuthStatus = { login: "camille-r", avatar_url: null, missing_scopes: [] };
const signedOut: AuthStatus = { login: null, avatar_url: null, missing_scopes: [] };
const onboarding = (s: Scenario) => s === "onboarding" || s === "checking" || s === "valid" || s === "invalid";

/** Counts calls per command, for tests that check a refetch. */
export const calls: Record<string, number> = {};

export function installMockBackend(scenario: Scenario) {
	mockWindows("main");
	let prefs: SyncPrefs = { interval: "five_minutes", on_wake: true };
	let auth = onboarding(scenario) ? signedOut : signedIn;
	let board = boardFor(scenario);
	const changed = () => emit("board-changed", { project_id: PROJECT });
	const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
		auth_status: () => auth,
		auth_set_token: async () => {
			if (scenario === "checking") return new Promise(() => {});
			await new Promise((resolve) => setTimeout(resolve, 600));
			if (scenario === "invalid") {
				throw { kind: "Auth", message: "token rejected by GitHub (401)" } satisfies AppError;
			}
			auth = signedIn;
			return auth;
		},
		auth_sign_out: () => {
			auth = signedOut;
			return null;
		},
		list_projects: () => projects,
		cached_projects: () => projects,
		open_project: () => null,
		current_project: () => (onboarding(scenario) ? null : PROJECT),
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
				{ id: "PVTV_1", number: 1, name: "Board", layout: "Board", filter: null, group_by: null, manual_order: true },
			],
		}),
		get_board: () => board,
		// Like Rust: queue, return the board with the move, then send it in the background.
		dispatch_intent: (args) => {
			const intent = args.intent as Intent;
			const before = board;
			if (!before) throw new Error("mockBackend: no board to move a card on");
			const pending = (b: Board, value: boolean): Board => ({
				...b,
				columns: b.columns.map((c) => ({
					...c,
					cards: c.cards.map((card) => (card.item_id === intent.item_id ? { ...card, pending: value } : card)),
				})),
			});
			board = pending(moveCard(before, intent), true);
			if (scenario !== "offline") {
				setTimeout(async () => {
					if (scenario === "rollback") {
						board = before;
						await emit("mutation-failed", { intent, message: "PLANCHE_FAULT=fail_mutations" });
					} else {
						board = pending(board ?? before, false);
					}
					await changed();
				}, 300);
			}
			return board;
		},
		refresh_project: () => ({ project: PROJECT, items: 17, cost: 4, usage: {}, changes: [] }),
		sync_status: () => statusFor(scenario),
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
			if (cmd.startsWith("plugin:")) return null;
			const handler = handlers[cmd];
			if (!handler) throw new Error(`mockBackend: no handler for ${cmd}`);
			return handler((args ?? {}) as Record<string, unknown>);
		},
		{ shouldMockEvents: true },
	);
	Object.assign(window, { __planche: { emit, calls } });
}
