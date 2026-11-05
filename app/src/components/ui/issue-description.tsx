import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";

export type DescriptionStatus =
  | "loading"
  | "refreshing"
  | "ready"
  | "offline"
  | "error"
  | "unavailable";

export function IssueDescriptionContent({
  body,
  status,
  message,
  onRetry,
  sourceUrl,
  onOpenLink,
  onEdit,
  pending = false,
  syncError,
}: {
  body?: string;
  status: DescriptionStatus;
  message?: string;
  onRetry: () => void;
  sourceUrl?: string;
  onOpenLink: (url: string) => void;
  onEdit?: () => void;
  pending?: boolean;
  syncError?: string | null;
}) {
  const loading = status === "loading" || status === "refreshing";

  return (
    <section
      aria-label="Description"
      aria-busy={loading}
      className="mt-7 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Description</h2>
        {onEdit && body !== undefined && status !== "unavailable" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            disabled={pending}
          >
            Edit description
          </Button>
        ) : null}
      </div>
      {pending ? (
        <p
          role="status"
          className="text-fg-3 text-sm"
        >
          Description saved on this Mac · Waiting for GitHub sync
        </p>
      ) : null}
      {syncError ? (
        <p
          role="alert"
          className="text-danger text-sm"
        >
          Could not update GitHub: {syncError}. Your edited description is saved on this Mac. Edit
          to retry.
        </p>
      ) : null}
      {status !== "ready" ? (
        <div className="flex flex-wrap items-center gap-2 text-fg-3 text-sm">
          <p role={status === "error" ? "alert" : "status"}>
            {status === "unavailable"
              ? "Description unavailable. Your access may have changed."
              : status === "loading"
                ? "Loading description…"
                : status === "refreshing"
                  ? "Saved description · Refreshing…"
                  : status === "offline"
                    ? body === undefined
                      ? "Description unavailable offline."
                      : "Saved description · Offline"
                    : body === undefined
                      ? "Could not load the description."
                      : "Saved description · Could not refresh"}
            {message ? ` ${message}` : ""}
          </p>
          {!loading ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRetry}
            >
              Retry description
            </Button>
          ) : null}
        </div>
      ) : null}
      {body !== undefined && status !== "unavailable" ? (
        <Markdown
          body={body || "No description provided."}
          sourceUrl={sourceUrl}
          onOpenLink={onOpenLink}
        />
      ) : null}
    </section>
  );
}

export function IssueDescriptionEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving = false,
  error,
  sourceUrl,
  onOpenLink,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  error?: string | null;
  sourceUrl?: string;
  onOpenLink: (url: string) => void;
}) {
  const id = useId();
  const [preview, setPreview] = useState(false);

  return (
    <section
      aria-label="Edit description"
      className="mt-7 space-y-3"
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving) {
            onSave();
          }
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={id}
            className="font-medium"
          >
            Description Markdown
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Write" : "Preview"}
          </Button>
        </div>
        <div className="h-120 w-full">
          {preview ? (
            <section
              aria-label="Description preview"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the fixed-height preview.
              tabIndex={0}
              className="h-full overflow-auto rounded-md bg-surface p-3 shadow-[inset_0_0_0_1px_var(--pl-border-strong)] focus-visible:shadow-ring"
            >
              <Markdown
                body={value || "No description provided."}
                sourceUrl={sourceUrl}
                onOpenLink={onOpenLink}
              />
            </section>
          ) : (
            <Textarea
              id={id}
              value={value}
              disabled={saving}
              aria-describedby={`${id}-help`}
              className="h-full [&_textarea]:h-full [&_textarea]:resize-none"
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </div>
        <p
          id={`${id}-help`}
          className="text-fg-3 text-sm"
        >
          Markdown supported.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save description"}
          </Button>
        </div>
        {error ? (
          <p
            role="alert"
            className="text-danger text-sm"
          >
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
