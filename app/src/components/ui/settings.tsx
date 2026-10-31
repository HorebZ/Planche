import { CircleUserRound, Keyboard, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type SettingsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  login: string;
  interval: string;
  onIntervalChange: (interval: string) => void;
  onWake: boolean;
  onWakeChange: (value: boolean) => void;
  theme: "system" | "light" | "dark";
  onThemeChange: (theme: "system" | "light" | "dark") => void;
  onSignOut: () => void;
  shortcuts: { label: string; keys: string }[];
};

export function SettingsDialog({
  open,
  onOpenChange,
  login,
  interval,
  onIntervalChange,
  onWake,
  onWakeChange,
  theme,
  onThemeChange,
  onSignOut,
  shortcuts,
}: SettingsProps) {
  const [section, setSection] = useState<"general" | "shortcuts">("general");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="grid h-[560px] max-h-[calc(100vh-32px)] w-[760px] max-w-[calc(100vw-32px)] grid-cols-[188px_minmax(0,1fr)] gap-0 overflow-hidden rounded-window p-0 shadow-pop">
        <nav
          aria-label="Settings sections"
          className="flex flex-col gap-1 bg-bg-sunken px-2.5 pt-5"
        >
          <DialogTitle className="mb-3 px-2 text-base">Settings</DialogTitle>
          {(
            [
              { id: "general", label: "General", Icon: CircleUserRound },
              { id: "shortcuts", label: "Shortcuts", Icon: Keyboard },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              type="button"
              key={id}
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={`flex h-7 items-center gap-2 rounded-md px-2 text-left font-medium focus-visible:shadow-ring ${section === id ? "bg-active" : "text-fg-2 hover:bg-hover"}`}
            >
              <Icon className="size-4 text-fg-3" />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 overflow-y-auto px-7 py-6">
          <h2 className="mb-1 font-semibold text-lg">
            {section === "general" ? "General" : "Keyboard shortcuts"}
          </h2>
          <DialogDescription className="mb-6">
            {section === "general"
              ? "Your account and preferences."
              : "Move through Planche from your keyboard."}
          </DialogDescription>
          {section === "general" ? (
            <div className="flex flex-col gap-6">
              <SettingsGroup title="Account">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{login}</span>
                    <p className="text-fg-3 text-sm">Connected to GitHub</p>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="h-7 rounded-md px-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--pl-border-strong)] hover:bg-hover focus-visible:shadow-ring"
                  >
                    Sign out
                  </button>
                </div>
              </SettingsGroup>
              <SettingsGroup title="Sync">
                <div className="flex flex-col gap-2">
                  Refresh interval
                  <ToggleGroup
                    type="single"
                    aria-label="Refresh interval"
                    value={interval}
                    onValueChange={(value) => value && onIntervalChange(value)}
                    className="w-max bg-active"
                  >
                    {[
                      { value: "one_minute", label: "1 min" },
                      { value: "five_minutes", label: "5 min" },
                      { value: "fifteen_minutes", label: "15 min" },
                      { value: "manual", label: "Manual" },
                    ].map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span>Sync when the Mac wakes up</span>
                  <Switch
                    aria-label="Sync when the Mac wakes up"
                    checked={onWake}
                    onCheckedChange={onWakeChange}
                  />
                </div>
              </SettingsGroup>
              <SettingsGroup title="Appearance">
                <fieldset
                  aria-label="Theme"
                  className="grid grid-cols-3 gap-3"
                >
                  {(
                    [
                      { value: "system", label: "System", Icon: Monitor },
                      { value: "light", label: "Light", Icon: Sun },
                      { value: "dark", label: "Dark", Icon: Moon },
                    ] as const
                  ).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={theme === value}
                      onClick={() => onThemeChange(value)}
                      className={`flex flex-col items-center gap-2 rounded-lg px-3 py-3 focus-visible:shadow-ring ${theme === value ? "shadow-[0_0_0_2px_var(--pl-fg)]" : "shadow-[0_0_0_1px_var(--pl-border)] hover:bg-hover"}`}
                    >
                      <Icon className="size-6 text-fg-3" />
                      <span className="text-sm">{label}</span>
                    </button>
                  ))}
                </fieldset>
              </SettingsGroup>
            </div>
          ) : (
            <div className="flex flex-col">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex h-10 items-center justify-between border-line border-b text-fg-2"
                >
                  <span>{shortcut.label}</span>
                  <Kbd>{shortcut.keys}</Kbd>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 border-line border-b pb-2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}
