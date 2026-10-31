import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { notify, ToastCard, toast } from "@/components/ui/toast";
import {
  type AuthStatus,
  type Board,
  commands,
  type DispatchOutcome,
  type Intent,
  type ProjectId,
  type ViewId,
} from "@/ipc/bindings.types";
import {
  authQuery,
  beginBoardWrite,
  boardAccountEpoch,
  boardQuery,
  currentProjectQuery,
  errorMessage,
  reconcileBoard,
} from "@/ipc/queries";
import { keysFor } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { describe, inverse, verbs } from "@/undo/inverse";
import { applyIntent } from "./moveCard";

export type DispatchResult = DispatchOutcome | { type: "unknown"; message: string };

/** Await the first bounded result; observe also receives late confirmation. Unknown is not a refusal. */
export function dispatchIntent(
  client: QueryClient,
  projectId: ProjectId,
  viewId: ViewId | null,
  intent: Intent,
  observe?: (result: DispatchResult) => void,
  prepared?: (before: Board | null | undefined) => void,
): Promise<DispatchResult> {
  return new Promise((resolve) => {
    let initial = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = (result: DispatchResult) => {
      if (!initial && result.type === "unknown") {
        return;
      }

      clearTimeout(timer);

      if (initial) {
        initial = false;
        lease.release();
        resolve(result);
      } else {
        reconcileBoard(client, projectId, lease.accountEpoch);
      }

      observe?.(result);
    };

    const lease = beginBoardWrite(client, projectId, () => {
      const key = boardQuery(projectId, viewId).queryKey;
      const before = client.getQueryData<Board | null>(key);

      prepared?.(before);

      const optimistic = before
        ? client.setQueryData(key, markPending(applyIntent(before, intent), intent.item_id))
        : undefined;

      timer = setTimeout(
        () => publish({ type: "unknown", message: "No response after 15 s" }),
        15_000,
      );

      let receipt: Promise<DispatchOutcome>;

      try {
        receipt = commands.dispatchIntent(intent);
      } catch (error) {
        receipt = Promise.reject(error);
      }

      void receipt.then(
        (result) => {
          if (
            result.type === "rejected" &&
            lease.ownsProjection() &&
            optimistic &&
            boardAccountEpoch(client) === lease.accountEpoch &&
            client.getQueryData(key) === optimistic
          ) {
            client.setQueryData(key, before);
          }

          publish(result);
        },
        (error: unknown) => publish({ type: "unknown", message: errorMessage(error) }),
      );
    });

    void lease.prepared.catch((error: unknown) =>
      publish({ type: "rejected", error: { kind: "Invalid", message: errorMessage(error) } }),
    );
  });
}

/** Keep the touched card Pending until the next board read replaces this projection. */
function markPending(board: Board, id: string): Board {
  return {
    ...board,
    columns: board.columns.map((c) => ({
      ...c,
      cards: c.cards.map((card) => (card.item_id === id ? { ...card, pending: true } : card)),
    })),
  };
}

/**
 * `run` keeps the inverse for ⌘Z and reports unconfirmed results once in their context.
 * `observe` also receives late confirmation, even after leaving that context.
 * `undo` dispatches that inverse, once.
 */
export function useActions(projectId: ProjectId, viewId: ViewId | null) {
  const client = useQueryClient();

  useEffect(() => {
    let previous = client.getQueryData(currentProjectQuery.queryKey);

    return client.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] !== "current-project") {
        return;
      }

      const next = client.getQueryData(currentProjectQuery.queryKey);

      if (next !== previous && useUi.getState().projectId === null) {
        useUi.getState().invalidateUndo();
      }

      previous = next;
    });
  }, [client]);

  return useMemo(() => {
    const inContext = () => {
      const state = useUi.getState();

      return (
        (state.projectId ?? client.getQueryData(currentProjectQuery.queryKey) ?? projectId) ===
          projectId && state.viewId === viewId
      );
    };

    const identity = () => client.getQueryData<AuthStatus>(authQuery.queryKey)?.id;

    const run = (intent: Intent, observe?: (result: DispatchResult) => void) => {
      const owner = useUi.getState().claimAction();
      const account = identity();
      const epoch = boardAccountEpoch(client);
      const context = useUi.getState().contextVersion;
      let undo: Intent | null = null;
      let label = `${verbs[intent.type]} ${intent.item_id}`;

      return dispatchIntent(
        client,
        projectId,
        viewId,
        intent,
        (result) => {
          try {
            if (
              context !== useUi.getState().contextVersion ||
              epoch !== boardAccountEpoch(client) ||
              !inContext() ||
              identity() !== account
            ) {
              return;
            }

            if (result.type === "unknown") {
              notify(`Could not confirm: ${label}. ${result.message}`, "error");
            }

            if (result.type === "rejected") {
              notify(`Could not apply: ${label}. ${result.error.message}`, "error");
            }

            if (result.type !== "accepted") {
              return;
            }

            if (!useUi.getState().acceptUndo(owner, undo && { owner, intent: undo, label })) {
              return;
            }

            toast.custom(
              (t) => (
                <ToastCard
                  tone="success"
                  message={label}
                  action={
                    undo
                      ? {
                          label: "Undo",
                          kbd: keysFor("undo").join(""),
                          onClick: () => {
                            toast.dismiss(t);
                            void undoLast(owner);
                          },
                        }
                      : undefined
                  }
                />
              ),
              { id: `action-${owner}` },
            );
          } finally {
            observe?.(result);
          }
        },
        (before) => {
          undo = before ? inverse(before, intent) : null;

          if (before) {
            label = describe(before, intent);
          }
        },
      );
    };

    const undoLast = async (expectedOwner?: number) => {
      if (!inContext()) {
        return;
      }

      const account = identity();
      const last = useUi.getState().takeUndo(expectedOwner);

      if (!last) {
        return;
      }

      const version = useUi.getState().actionVersion;
      const context = useUi.getState().contextVersion;
      const epoch = boardAccountEpoch(client);

      toast.dismiss(`action-${last.owner}`);

      return dispatchIntent(client, projectId, viewId, last.intent, (result) => {
        if (
          !inContext() ||
          identity() !== account ||
          epoch !== boardAccountEpoch(client) ||
          context !== useUi.getState().contextVersion
        ) {
          return;
        }

        if (result.type === "unknown") {
          notify(`Could not confirm Undo: ${last.label}. ${result.message}`, "error");
        }

        if (result.type === "rejected") {
          notify(`Could not Undo: ${last.label}. ${result.error.message}`, "error");
        }

        if (result.type === "accepted") {
          if (useUi.getState().actionVersion === version) {
            notify(`Undone: ${last.label}`, "success");
          }
        }
      });
    };

    return { run, undo: undoLast };
  }, [client, projectId, viewId]);
}
