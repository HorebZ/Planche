import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import "sonner/dist/styles.css";

export { toast };

type ToastTone = "info" | "success" | "error";

type ToastCardProps = ComponentProps<"div"> & {
  tone?: ToastTone;
  message: ReactNode;
  action?: {
    label: string;
    kbd?: string;
    onClick?: () => void;
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

export function ToastCard({ tone = "info", message, action, className, ...props }: ToastCardProps) {
  return (
    <div
      data-slot="toast"
      className={cn(
        "flex h-[34px] items-center gap-2.5 rounded-lg bg-elevated font-sans text-base text-fg shadow-pop",
        action ? "pr-1.5 pl-3" : "px-3",
        className,
      )}
      {...props}
    >
      <ToastIcon tone={tone} />
      <span className="min-w-0">{message}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="ml-auto flex h-6 shrink-0 items-center gap-1.5 rounded-sm bg-hover pr-1 pl-2 font-medium text-sm focus-visible:shadow-ring"
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
    </div>
  );
}

/** Shows a message in a ToastCard, the way the design draws a toast. */
export function notify(message: ReactNode, tone: ToastTone = "info") {
  return toast.custom(() => (
    <ToastCard
      tone={tone}
      message={message}
    />
  ));
}

type ToasterProps = ComponentProps<typeof Sonner>;

export function Toaster({ id, className, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      expand
      offset={16}
      {...props}
      id={id}
      className={className}
      toastOptions={{
        ...toastOptions,
        unstyled: true,
        classNames: {
          toast: "w-max bg-transparent p-0 shadow-none",
          ...toastOptions?.classNames,
        },
      }}
    />
  );
}
