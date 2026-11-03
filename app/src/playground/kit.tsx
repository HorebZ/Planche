import { type ReactNode, useState } from "react";
import { PortalContainerProvider } from "@/components/ui/portal";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";

function ThemeScope({
  theme,
  highContrast = false,
  children,
}: {
  theme: Theme;
  highContrast?: boolean;
  children: ReactNode;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setContainer}
      data-theme-scope={highContrast ? `high-contrast-${theme}` : theme}
      data-contrast={highContrast ? "high" : undefined}
      className={cn(
        theme,
        "relative min-w-0 rounded-window bg-bg p-6 text-fg shadow-[0_0_0_1px_var(--pl-border)]",
      )}
    >
      {highContrast && <p className="mb-3 font-mono text-fg-3 text-xs">High contrast · {theme}</p>}
      <PortalContainerProvider value={container}>{children}</PortalContainerProvider>
    </div>
  );
}

/** Renders each color scheme with standard and high contrast, side by side. */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: () => ReactNode;
}) {
  return (
    <section
      id={id}
      data-section={id}
      className="flex flex-col gap-3"
    >
      <h2 className="font-mono font-semibold text-fg-3 text-xs">{title}</h2>
      <div className="grid grid-cols-2 gap-6">
        <ThemeScope theme="light">{children()}</ThemeScope>
        <ThemeScope theme="dark">{children()}</ThemeScope>
        <ThemeScope
          theme="light"
          highContrast
        >
          {children()}
        </ThemeScope>
        <ThemeScope
          theme="dark"
          highContrast
        >
          {children()}
        </ThemeScope>
      </div>
    </section>
  );
}

export function Row({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && <div className="font-mono text-2xs text-fg-3">{label}</div>}
      <div className={cn("flex flex-wrap items-start gap-3", className)}>{children}</div>
    </div>
  );
}

/** One component in one state, captioned with the state name. */
export function State({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("m-0 flex flex-col items-start gap-1.5", className)}>
      {children}
      <figcaption className="font-mono text-2xs text-fg-3">{label}</figcaption>
    </figure>
  );
}
