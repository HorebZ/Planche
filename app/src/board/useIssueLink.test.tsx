// @vitest-environment happy-dom
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, test, vi } from "vitest";
import { authStatus } from "@/ipc/_fixtures/user.fixtures";
import { commands } from "@/ipc/bindings.types";
import { authQuery, createQueryClient } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import { button, click, render } from "@/test-support";
import { useIssueLink } from "./useIssueLink";

const url = "https://github.com/other/repo/issues/61635";

function Link({ target = url }: { target?: string }) {
  const open = useIssueLink("A");

  return (
    <button
      type="button"
      onClick={() => open(target)}
    >
      Link
    </button>
  );
}

test("accessible issues open internally even outside the current project or repository", async () => {
  const resolve = vi.spyOn(commands, "resolveIssue").mockResolvedValue("I_linked");
  const external = vi.fn();
  mockIPC(external);

  render(<Link />);
  click(button("Link"));

  await expect.poll(() => useUi.getState().linkedIssue).toEqual({ content: "I_linked", url });
  expect(resolve).toHaveBeenCalledWith("A", url);
  expect(external).not.toHaveBeenCalled();
});

test.each(["unavailable", "failed"])("%s references fall back to GitHub", async (result) => {
  const resolve = vi.spyOn(commands, "resolveIssue");
  if (result === "unavailable") {
    resolve.mockResolvedValue(null);
  } else {
    resolve.mockRejectedValue({ kind: "Network", message: "Offline" });
  }
  const external = vi.fn();
  mockIPC(external);

  render(<Link />);
  click(button("Link"));

  await expect.poll(() => external.mock.calls.length).toBe(1);
  expect(external.mock.calls[0]).toEqual(["plugin:opener|open_url", { url, with: undefined }]);
  expect(useUi.getState().linkedIssue).toBeNull();
});

test.each(["https://example.com", "https://github.com/other/repo/pull/42"])(
  "other links open externally without looking up an issue: %s",
  (target) => {
    const resolve = vi.spyOn(commands, "resolveIssue");
    const external = vi.fn();
    mockIPC(external);

    render(<Link target={target} />);
    click(button("Link"));

    expect(resolve).not.toHaveBeenCalled();
    expect(external).toHaveBeenCalledOnce();
  },
);

test.each(["account", "navigation"])(
  "late resolutions are ignored after %s changes",
  async (change) => {
    let finish!: (content: string | null) => void;
    vi.spyOn(commands, "resolveIssue").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const external = vi.fn();
    mockIPC(external);
    const client = createQueryClient();
    client.setQueryData(authQuery.queryKey, authStatus({ id: "A" }));

    render(<Link />, client);
    click(button("Link"));
    if (change === "account") {
      client.setQueryData(authQuery.queryKey, authStatus({ id: "B" }));
    } else {
      useUi.getState().selectProject("another");
    }
    finish("I_linked");
    await Promise.resolve();

    expect(useUi.getState().linkedIssue).toBeNull();
    expect(external).not.toHaveBeenCalled();
  },
);
