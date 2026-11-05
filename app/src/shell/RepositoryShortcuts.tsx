import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RepositoryShortcut } from "@/components/ui/repository-shortcut";
import { notify } from "@/components/ui/toast";
import { commands, type RepositoryIssueShortcut } from "@/ipc/bindings.types";
import { authQuery, errorMessage } from "@/ipc/queries";
import { repositoriesQuery, repositoryShortcutsQuery } from "@/ipc/repositories.queries";
import { useRepositoryViews } from "@/stores/repository-views";

export function RepositoryShortcuts({ account, id }: { account: string; id: string }) {
  const client = useQueryClient();
  const shortcuts = useQuery(repositoryShortcutsQuery(account, id));
  const [pending, setPending] = useState(false);
  const mutate = async (operation: () => Promise<RepositoryIssueShortcut[]>) => {
    if (pending) {
      return false;
    }
    setPending(true);
    try {
      const result = await operation();
      if (
        client.getQueryData(authQuery.queryKey)?.id !== account ||
        !client
          .getQueryData(repositoriesQuery(account).queryKey)
          ?.some((saved) => saved.repository.id === id)
      ) {
        return false;
      }
      client.setQueryData(repositoryShortcutsQuery(account, id).queryKey, result);
      return true;
    } catch (error) {
      notify(`Could not update saved filter: ${errorMessage(error)}`, "error");
      return false;
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {shortcuts.data?.map((shortcut) => (
        <RepositoryShortcut
          key={shortcut.id}
          name={shortcut.name}
          pending={pending}
          onOpen={() => useRepositoryViews.getState().open(account, id, shortcut.filter)}
          onRename={(name) =>
            mutate(() => commands.renameRepositoryIssueShortcut(account, id, shortcut.id, name))
          }
          onDuplicate={() =>
            void mutate(() => commands.saveRepositoryIssueShortcut(account, id, shortcut.filter))
          }
          onRemove={() =>
            void mutate(() => commands.deleteRepositoryIssueShortcut(account, id, shortcut.id))
          }
        />
      ))}
      {shortcuts.error && (
        <p
          role="alert"
          className="px-2.5 text-danger text-xs"
        >
          Could not load saved filters.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void shortcuts.refetch()}
          >
            Retry
          </button>
        </p>
      )}
    </>
  );
}
