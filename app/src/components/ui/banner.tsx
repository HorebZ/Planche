import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type BannerProps = Omit<ComponentProps<"div">, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
};

export function Banner({
  icon,
  title,
  description,
  meta,
  action,
  className,
  ...props
}: BannerProps) {
  return (
    <div
      data-slot="banner"
      role="alert"
      className={cn(
        "flex items-center gap-2.5 rounded-lg bg-danger-soft py-[7px] pr-2 pl-3 shadow-[inset_0_0_0_1px_var(--pl-danger-soft)]",
        className,
      )}
      {...props}
    >
      {icon && <span className="flex shrink-0 text-danger [&_svg]:size-[18px]">{icon}</span>}
      <span className="shrink-0 font-semibold text-danger">{title}</span>
      {description && <span className="min-w-0 flex-1 truncate text-fg-2">{description}</span>}
      {meta && <span className="shrink-0 text-fg-3 text-xs tabular-nums">{meta}</span>}
      {action}
    </div>
  );
}
