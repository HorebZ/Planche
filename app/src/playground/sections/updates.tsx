import { UpdateContent } from "@/components/ui/update";
import { updateStatus } from "@/ipc/_fixtures/update.fixtures";
import type { UpdatePhase } from "@/ipc/bindings.types";
import { Section, State } from "../kit";

export function UpdatesSection() {
  return (
    <Section
      id="updates"
      title="Alpha updates"
    >
      {() => (
        <div className="flex flex-col gap-6">
          {(
            [
              "idle",
              "checking",
              "current",
              "available",
              "downloading",
              "ready",
              "installing",
              "error",
            ] as UpdatePhase[]
          ).map((phase) => (
            <State
              key={phase}
              label={phase}
              className="w-full rounded-lg bg-elevated p-4 shadow-pop"
            >
              <UpdateContent
                status={updateStatus({
                  phase,
                  release:
                    phase === "idle" || phase === "current" || phase === "checking"
                      ? null
                      : {
                          version: "0.1.0-alpha.2",
                          notes: "Fixes and improvements for the alpha.",
                        },
                  received: 5242880,
                  total: 10485760,
                  error:
                    phase === "error"
                      ? "Signature verification failed. Your installed app is unchanged."
                      : null,
                })}
                blocked={false}
                onCheck={() => {}}
                onDownload={() => {}}
                onInstall={() => {}}
                onClose={() => {}}
              />
            </State>
          ))}
          <State
            label="unsaved draft"
            className="w-full rounded-lg bg-elevated p-4 shadow-pop"
          >
            <UpdateContent
              status={updateStatus({
                phase: "ready",
                release: { version: "0.1.0-alpha.2", notes: "Ready to install." },
              })}
              blocked
              onCheck={() => {}}
              onDownload={() => {}}
              onInstall={() => {}}
              onClose={() => {}}
            />
          </State>
        </div>
      )}
    </Section>
  );
}
