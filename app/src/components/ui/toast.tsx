import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useId, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import "sonner/dist/styles.css";

export { toast };

type ToastTone = "info" | "success" | "error";

type ToastCardProps = ComponentProps<"div"> & {
  tone?: ToastTone;
  message: ReactNode;
  description?: ReactNode;
  onDismiss?: () => void;
  action?: {
    label: string;
    kbd?: string;
    onClick?: () => void;
    disabled?: boolean;
  };
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  const className = "size-4 shrink-0";

  if (tone === "success") {
    return <CircleCheck className={cn(className, "text-success")} />;
  }

  if (tone === "error") {
    return <CircleAlert className={cn(className, "text-danger")} />;
  }

  return <Info className={cn(className, "text-fg-2")} />;
}

export function ToastCard({
  tone = "info",
  message,
  description,
  action,
  onDismiss,
  className,
  ...props
}: ToastCardProps) {
  return (
    <div
      data-slot="toast"
      className={cn(
        "flex min-h-[34px] w-[min(440px,calc(100vw-32px))] items-center gap-2.5 rounded-lg border border-transparent bg-elevated py-2 pr-2 pl-3 font-sans text-base text-fg shadow-pop",
        tone === "error" && "border-danger bg-danger-surface",
        className,
      )}
      {...props}
    >
      <ToastIcon tone={tone} />
      <span className="min-w-0 flex-1 break-words">
        {message}
        {description ? <span className="mt-1 block text-fg-2 text-xs">{description}</span> : null}
      </span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className="ml-auto flex h-6 shrink-0 items-center gap-1.5 rounded-sm bg-hover pr-2 pl-2 font-medium text-sm focus-visible:shadow-ring disabled:pointer-events-none disabled:text-fg-3"
        >
          {action.label}
          {action.kbd ? (
            <Kbd
              size="sm"
              className="text-fg-3"
            >
              {action.kbd}
            </Kbd>
          ) : null}
        </button>
      ) : null}
      {onDismiss ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className={cn("size-5 [&_svg]:size-3.5", tone === "error" && "text-danger")}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorToast({
  message,
  description,
  pending,
  onRetry,
}: {
  message: string | null;
  description?: string;
  pending: boolean;
  onRetry: () => void;
}) {
  const id = useId();
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!message || dismissed === message) {
      toast.dismiss(id);

      if (!message) {
        setDismissed(null);
      }

      return;
    }

    toast.custom(
      () => (
        <ToastCard
          role="alert"
          tone="error"
          message={message}
          description={description}
          action={{ label: "Retry now", onClick: onRetry, disabled: pending }}
          onDismiss={() => {
            setDismissed(message);
            toast.dismiss(id);
          }}
        />
      ),
      { id, duration: Number.POSITIVE_INFINITY, dismissible: false },
    );
  }, [id, message, description, pending, onRetry, dismissed]);
  useEffect(() => () => void toast.dismiss(id), [id]);

  return null;
}

/** Shows a message in a ToastCard, the way the design draws a toast. */
export function notify(message: ReactNode, tone: ToastTone = "info") {
  return toast.custom((id) => (
    <ToastCard
      tone={tone}
      message={message}
      onDismiss={() => toast.dismiss(id)}
    />
  ));
}

type ToasterProps = ComponentProps<typeof Sonner>;

export function Toaster({ id, className, style, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      expand
      offset={16}
      {...props}
      id={id}
      className={className}
      style={{ width: "min(440px, calc(100vw - 32px))", ...style }}
      toastOptions={{
        ...toastOptions,
        unstyled: true,
        style: { width: "100%", ...toastOptions?.style },
        classNames: {
          toast: "bg-transparent p-0 shadow-none",
          ...toastOptions?.classNames,
        },
      }}
    />
  );
}
