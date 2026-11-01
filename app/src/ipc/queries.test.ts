// @vitest-environment happy-dom

import { onlineManager, QueryObserver } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { issueDescription } from "@/ipc/_fixtures/description.fixtures";
import { issueRecord } from "@/ipc/_fixtures/issue.fixtures";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import { useUi } from "@/stores/ui";
import {
  authQuery,
  beginBoardWrite,
  boardQuery,
  cachedDescriptionQuery,
  cachedIssueQuery,
  createQueryClient,
  descriptionQuery,
  issueQuery,
  listenToCore,
} from "./queries";

afterEach(() => clearMocks());

test("the same GitHub issue uses one query without Project or item IDs", async () => {
  const issue = issueRecord();
  const calls: unknown[] = [];

  mockIPC((command, args) => {
    calls.push({ command, args });

    return { status: "ready", issue };
  });

  const client = createQueryClient();
  const result = await client.fetchQuery(issueQuery("A", "I_standalone"));

  expect(result).toEqual({ status: "ready", issue });
  expect(client.getQueryData(cachedIssueQuery("A", "I_standalone").queryKey)).toEqual(issue);
  expect(calls).toEqual([
    { command: "refresh_issue", args: { account: "A", content: "I_standalone" } },
  ]);
  client.clear();
});

test("an unavailable issue clears its shared description and leaves other accounts isolated", async () => {
  const client = createQueryClient();

  client.setQueryData(
    cachedDescriptionQuery("A", "I_standalone").queryKey,
    issueDescription({ body: "private" }),
  );
  client.setQueryData(
    descriptionQuery("A", "I_standalone").queryKey,
    issueDescription({ body: "private" }),
  );
  client.setQueryData(cachedIssueQuery("B", "I_standalone").queryKey, issueRecord());
  mockIPC(() => ({ status: "unavailable" }));

  await client.fetchQuery(issueQuery("A", "I_standalone"));

  expect(client.getQueryData(cachedIssueQuery("A", "I_standalone").queryKey)).toBeNull();
  expect(client.getQueryData(cachedDescriptionQuery("A", "I_standalone").queryKey)).toBeNull();
  expect(client.getQueryData(descriptionQuery("A", "I_standalone").queryKey)).toBeNull();
  expect(client.getQueryData(cachedIssueQuery("B", "I_standalone").queryKey)).toEqual(
    issueRecord(),
  );
  client.clear();
});

test("switching accounts cancels a late issue response before it can populate shared caches", async () => {
  const client = createQueryClient();
  let finish = (_result: unknown) => {};

  client.setQueryData(authQuery.queryKey, authStatus({ id: "A" }));
  mockIPC(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = client.fetchQuery(issueQuery("A", "I_standalone")).catch(() => null);

  client.setQueryData(authQuery.queryKey, authStatus({ id: "B" }));
  finish({ status: "ready", issue: issueRecord() });
  await pending;

  expect(client.getQueriesData({ queryKey: ["issue"] })).toEqual([]);
  client.clear();
});

test("a refused description invalidates previously loaded issue content", async () => {
  const client = createQueryClient();

  client.setQueryData(cachedIssueQuery("A", "I_standalone").queryKey, issueRecord());
  mockIPC(() => null);

  await client.fetchQuery(descriptionQuery("A", "I_standalone"));

  expect(client.getQueryData(cachedIssueQuery("A", "I_standalone").queryKey)).toBeNull();
  expect(client.getQueryData(issueQuery("A", "I_standalone").queryKey)).toEqual({
    status: "unavailable",
  });
  client.clear();
});

test("cancelled authentication retries only on an explicit request", async () => {
  let attempts = 0;

  mockIPC((cmd) => {
    if (cmd !== "auth_status") {
      throw new Error(cmd);
    }

    if (++attempts === 1) {
      throw { kind: "Auth", message: "Authentication cancelled" };
    }

    return authStatus({ id: "U_me", login: "me" });
  });

  const client = createQueryClient();

  client.mount();

  let unsubscribe = () => {};

  try {
    const first = new QueryObserver(client, authQuery);

    unsubscribe = first.subscribe(() => {});

    await expect.poll(() => first.getCurrentResult().isError).toBe(true);

    unsubscribe();

    const remounted = new QueryObserver(client, authQuery);

    unsubscribe = remounted.subscribe(() => {});
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(attempts).toBe(1);
    expect(remounted.getCurrentResult().isError).toBe(true);

    await remounted.refetch();

    expect(attempts).toBe(2);
    expect(remounted.getCurrentResult().data?.login).toBe("me");
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    onlineManager.setOnline(true);
  }
});

test("a board-changed event refetches get_board for that project", async () => {
  const calls: string[] = [];

  mockIPC(
    (cmd, args) => {
      calls.push(cmd);

      if (cmd === "get_board") {
        return { project: { id: (args as { projectId: string }).projectId } };
      }

      throw new Error(`unexpected ${cmd}`);
    },
    { shouldMockEvents: true },
  );

  const client = createQueryClient();
  const stop = await listenToCore(client);
  // An observer keeps the query active, as a mounted board does.
  const observer = new QueryObserver(client, boardQuery("PVT_1", null));
  const unsubscribe = observer.subscribe(() => {});

  await expect.poll(() => calls.filter((c) => c === "get_board").length).toBe(1);

  await emit("board-changed", { project_id: "PVT_other" });
  await emit("board-changed", { project_id: "PVT_1" });

  await expect.poll(() => calls.filter((c) => c === "get_board").length).toBe(2);

  unsubscribe();
  stop();
});

test("board changes during a drag are coalesced until the drop", async () => {
  let reads = 0;

  mockIPC(
    (command) => {
      if (command === "get_board") {
        reads++;

        return null;
      }

      throw new Error(`unexpected ${command}`);
    },
    { shouldMockEvents: true },
  );

  const client = createQueryClient();
  const stop = await listenToCore(client);
  const unsubscribe = new QueryObserver(client, boardQuery("P", null)).subscribe(() => {});

  try {
    await expect.poll(() => reads).toBe(1);

    useUi.getState().setDragging(true);
    await emit("board-changed", { project_id: "P" });
    await emit("board-changed", { project_id: "P" });

    expect(reads).toBe(1);

    useUi.getState().setDragging(false);

    await expect.poll(() => reads).toBe(2);
  } finally {
    unsubscribe();
    stop();
    useUi.getState().setDragging(false);
    client.clear();
  }
});

test.each([false, true])(
  "stale read/error %s is discarded across views while other projects and clients read",
  async (fail) => {
    let finish: () => void = () => {};
    let reads = 0;

    mockIPC((cmd) => {
      if (cmd !== "get_board") {
        throw new Error(cmd);
      }

      if (++reads === 1) {
        return new Promise((resolve, reject) => {
          finish = () => (fail ? reject(new Error("stale")) : resolve({ marker: "stale" }));
        });
      }

      return { marker: "fresh" };
    });

    const client = createQueryClient();
    const other = createQueryClient();
    const values: unknown[] = [];
    const observer = new QueryObserver(client, boardQuery("P", "V1"));
    const stop = observer.subscribe((result) => values.push(result.error ?? result.data));

    await expect.poll(() => reads).toBe(1);

    const lease = beginBoardWrite(client, "P", () => {});

    await lease.prepared;
    finish();

    const second = client.fetchQuery(boardQuery("P", "V2"));

    await expect(client.fetchQuery(boardQuery("Q", null))).resolves.toEqual({ marker: "fresh" });
    await expect(other.fetchQuery(boardQuery("P", null))).resolves.toEqual({ marker: "fresh" });
    expect(reads).toBe(3);

    lease.release();

    await expect(second).resolves.toEqual({ marker: "fresh" });
    await expect.poll(() => observer.getCurrentResult().data).toEqual({ marker: "fresh" });
    expect(values).not.toContainEqual({ marker: "stale" });
    expect(values.some((value) => value instanceof Error)).toBe(false);

    stop();
    client.clear();
    other.clear();
  },
);

test("aborted gate readers stop without IPC and a new reader resumes after release", async () => {
  let reads = 0;

  mockIPC(() => {
    reads++;

    return { marker: "fresh" };
  });

  const client = createQueryClient();
  const lease = beginBoardWrite(client, "P", () => {});

  await lease.prepared;

  const reading = client.fetchQuery(boardQuery("P", null));
  const rejected = expect(reading).rejects.toBeDefined();

  await client.cancelQueries({ queryKey: ["board", "P"] }, { revert: false, silent: true });
  await rejected;

  expect(reads).toBe(0);

  lease.release();

  await expect(client.fetchQuery(boardQuery("P", null))).resolves.toEqual({ marker: "fresh" });
  expect(reads).toBe(1);

  client.clear();
});
