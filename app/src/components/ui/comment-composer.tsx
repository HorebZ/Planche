import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import type { CommentSubmission } from "@/ipc/bindings.types";
import { commandFor, keysFor } from "@/keyboard/shortcuts";

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  permitted,
  submitting = false,
  error,
  submissions = [],
  onRetry,
  sourceUrl,
  onOpenLink,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  permitted: boolean;
  submitting?: boolean;
  error?: string | null;
  submissions?: CommentSubmission[];
  onRetry: (comment: CommentSubmission) => void;
  sourceUrl?: string;
  onOpenLink: (url: string) => void;
}) {
  const id = useId();
  const disabled = !permitted || submitting;

  return (
    <section
      aria-label="Write a comment"
      className="mt-7 space-y-3"
    >
      {submissions
        .filter((comment) => comment.status !== "sent")
        .map((comment) => (
          <div
            key={comment.request_id}
            className="space-y-2 rounded-lg border border-line p-3"
          >
            <p
              role={comment.status === "failed" ? "alert" : "status"}
              className="text-fg-3 text-sm"
            >
              {comment.status === "queued"
                ? "Comment queued · Saved on this Mac"
                : comment.status === "uncertain"
                  ? "Checking whether your comment was posted…"
                  : (comment.error ?? "Comment could not be posted.")}
            </p>
            <Markdown
              body={comment.body}
              sourceUrl={sourceUrl}
              onOpenLink={onOpenLink}
            />
            {comment.status === "failed" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={!permitted || submitting}
                onClick={() => onRetry(comment)}
              >
                Retry comment
              </Button>
            ) : null}
          </div>
        ))}
      {submissions.at(-1)?.status === "sent" ? (
        <p
          role="status"
          className="text-fg-3 text-sm"
        >
          Comment posted.
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && value.trim()) {
            onSubmit();
          }
        }}
        className="space-y-3"
      >
        <MarkdownEditor
          label="Add a comment"
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-help`}
          placeholder="Leave a comment…"
          onChange={onChange}
          sourceUrl={sourceUrl}
          onOpenLink={onOpenLink}
          onKeyDown={(event) => {
            if (
              !event.nativeEvent.isComposing &&
              commandFor(event.nativeEvent, "comment") === "comment.send"
            ) {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            id={`${id}-help`}
            className="text-fg-3 text-sm"
          >
            {permitted
              ? "Unsent text stays here when you navigate."
              : "Commenting is unavailable with your current access or this conversation is locked."}
          </p>
          <Button
            type="submit"
            disabled={disabled || !value.trim()}
          >
            {submitting ? "Saving…" : "Send"}
            {keysFor("comment.send").map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
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
