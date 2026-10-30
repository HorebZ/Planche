// @vitest-environment happy-dom
import { onlineManager, QueryObserver } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { authQuery, beginBoardWrite, boardQuery, createQueryClient, listenToCore } from "./queries";

afterEach(() => clearMocks());

test("cancelled authentication retries only on an explicit request", async () => {
  let attempts = 0;
  mockIPC((cmd) => {
    if (cmd !== "auth_status") {
      throw new Error(cmd);
    }
    if (++attempts === 1) {
      throw { kind: "Auth", message: "Authentication cancelled" };
    }
    return { id: "U_me", login: "me", avatar_url: null, missing_scopes: [] };
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
