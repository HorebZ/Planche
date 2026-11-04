import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { RepositorySource, RepositorySummary } from "@/ipc/bindings.types";

export function RepositoryPickerContent({
  source,
  onSourceChange,
  search,
  onSearchChange,
  reference,
  onReferenceChange,
  repositories,
  selectedIds,
  loading,
  loadingMore = false,
  error,
  hasMore,
  adding,
  onMore,
  onAdd,
  onRetry,
}: {
  source: RepositorySource;
  onSourceChange: (source: RepositorySource) => void;
  search: string;
  onSearchChange: (value: string) => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  repositories: RepositorySummary[];
  selectedIds: string[];
  loading: boolean;
  loadingMore?: boolean;
  error?: string | null;
  hasMore: boolean;
  adding: string | null;
  onMore: () => void;
  onAdd: (reference: string) => void;
  onRetry: () => void;
}) {
  const id = useId();

  return (
    <div
      data-slot="repository-picker"
      className="flex min-h-0 flex-col gap-4"
    >
      <fieldset className="flex gap-2">
        <legend className="sr-only">Repository source</legend>
        {(["personal", "organizations"] as const).map((value) => (
          <Button
            type="button"
            key={value}
            variant={source === value ? "secondary" : "ghost"}
            aria-pressed={source === value}
            onClick={() => onSourceChange(value)}
          >
            {value === "personal" ? "Personal" : "Organizations"}
          </Button>
        ))}
      </fieldset>
      <Field>
        <label
          htmlFor={`${id}-search`}
          className="text-fg-2 text-sm"
        >
          Find a repository
        </label>
        <Input
          id={`${id}-search`}
          className="w-full"
          placeholder="Search your repositories…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          autoComplete="off"
        />
      </Field>
      <div
        className="max-h-60 min-h-12 overflow-y-auto"
        aria-busy={loading || loadingMore}
      >
        {loading ? (
          <p
            role="status"
            className="flex items-center gap-2 py-3 text-fg-3"
          >
            <Spinner size={14} />
            Loading repositories…
          </p>
        ) : repositories.length ? (
          <ul className="space-y-1">
            {repositories.map((repository) => {
              const selected = selectedIds.includes(repository.id);

              return (
                <li
                  key={repository.id}
                  className="flex min-w-0 items-center gap-3 rounded-md px-1 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-fg-2"
                      title={repository.full_name}
                    >
                      {repository.full_name}
                    </p>
                    {!repository.has_issues || repository.archived ? (
                      <p className="text-fg-3 text-sm">
                        {!repository.has_issues ? "Issues disabled" : "Archived"}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={selected || !repository.has_issues || adding !== null}
                    aria-label={
                      selected
                        ? `${repository.full_name} already added`
                        : `Add ${repository.full_name}`
                    }
                    onClick={() => onAdd(repository.full_name)}
                  >
                    {selected ? "Added" : adding === repository.full_name ? "Adding…" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : !error ? (
          <p className="py-3 text-fg-3 text-sm">No repositories found.</p>
        ) : null}
        {hasMore && !loading ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={loadingMore}
            onClick={onMore}
          >
            {loadingMore ? "Loading…" : "Load more repositories"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="space-y-2">
          <p
            role="alert"
            className="break-words text-danger text-sm"
          >
            {error}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onRetry}
          >
            Retry repositories
          </Button>
        </div>
      ) : null}
      <form
        className="space-y-2 border-line border-t pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (reference.trim() && !adding) {
            onAdd(reference);
          }
        }}
      >
        <Field>
          <label
            htmlFor={`${id}-reference`}
            className="text-fg-2 text-sm"
          >
            Repository name or GitHub URL
          </label>
          <Input
            id={`${id}-reference`}
            className="w-full"
            placeholder="owner/repository or https://github.com/owner/repository"
            value={reference}
            disabled={adding !== null}
            onChange={(event) => onReferenceChange(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Button
          type="submit"
          disabled={!reference.trim() || adding !== null}
        >
          {adding === reference ? "Adding…" : "Add repository"}
        </Button>
      </form>
    </div>
  );
}
