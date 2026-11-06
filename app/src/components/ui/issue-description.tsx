import { useId, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

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
      {status !== "ready" && status !== "refreshing" ? (
        <div className="flex flex-wrap items-center gap-2 text-fg-3 text-sm">
          <p role={status === "error" ? "alert" : "status"}>
            {status === "unavailable"
              ? "Description unavailable. Your access may have changed."
              : status === "loading"
                ? "Loading description…"
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
  title,
  onTitleChange,
  onChange,
  onSave,
  onCancel,
  saving = false,
  error,
  sourceUrl,
  onOpenLink,
}: {
  value: string;
  title?: string;
  onTitleChange?: (title: string) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  error?: string | null;
  sourceUrl?: string;
  onOpenLink: (url: string) => void;
}) {
  const titleId = useId();
  const titleInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    titleInput.current?.focus();
  }, []);

  return (
    <section
      aria-label={title === undefined ? "Edit description" : "Edit draft"}
      className="mt-7 space-y-3"
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && (title === undefined || title.trim())) {
            onSave();
          }
        }}
      >
        {title !== undefined ? (
          <label
            htmlFor={titleId}
            className="flex flex-col gap-2 font-medium"
          >
            Title
            <Input
              id={titleId}
              ref={titleInput}
              aria-label="Draft title"
              className="w-full"
              value={title}
              onChange={(event) => onTitleChange?.(event.target.value)}
              disabled={saving}
              required
            />
          </label>
        ) : null}
        <MarkdownEditor
          label="Description Markdown"
          value={value}
          onChange={onChange}
          disabled={saving}
          sourceUrl={sourceUrl}
          onOpenLink={onOpenLink}
          editorClassName="h-120 [&_textarea]:h-full [&_textarea]:resize-none"
        />
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
            disabled={saving || (title !== undefined && !title.trim())}
          >
            {saving ? "Saving…" : title === undefined ? "Save description" : "Save draft"}
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
