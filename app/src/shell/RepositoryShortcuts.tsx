import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { commands } from "@/ipc/bindings.types";
import { authQuery, errorMessage } from "@/ipc/queries";
import { repositoryShortcutsQuery } from "@/ipc/repositories.queries";
import { useRepositoryViews } from "@/stores/repository-views";

export function RepositoryShortcuts({ account, id }: { account: string; id: string }) {
  const client = useQueryClient();
  const shortcuts = useQuery(repositoryShortcutsQuery(account, id));
  const remove = async (shortcut: string) => {
    try {
      const result = await commands.deleteRepositoryIssueShortcut(account, id, shortcut);
      if (client.getQueryData(authQuery.queryKey)?.id === account) {
        client.setQueryData(repositoryShortcutsQuery(account, id).queryKey, result);
      }
    } catch (error) {
      notify(`Could not delete filter: ${errorMessage(error)}`, "error");
    }
  };

  return (
    <>
      {shortcuts.data?.map((shortcut) => (
        <div
          key={shortcut.id}
          className="group flex items-center gap-1 pl-5"
        >
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 flex-1 justify-start text-fg-2"
            onClick={() => useRepositoryViews.getState().open(account, id, shortcut.filter)}
          >
            <Bookmark />
            <span className="truncate">{shortcut.name}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 text-fg-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            aria-label={`Delete filter ${shortcut.name}`}
            onClick={() => void remove(shortcut.id)}
          >
            <X className="size-3" />
          </Button>
        </div>
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
