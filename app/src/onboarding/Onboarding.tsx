import { useQueryClient } from "@tanstack/react-query";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, CircleCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldMessage, Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  AccountBlock,
  AppIcon,
  Logotype,
  ScopeRow,
  type ScopeState,
} from "@/components/ui/onboarding";
import { SidebarGroup, SidebarItem } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { type AuthStatus, commands, type ProjectId, type ProjectList } from "@/ipc/bindings";
import { authQuery, currentProjectQuery, errorMessage, useProjects } from "@/ipc/queries";
import { useUi } from "@/stores/ui";
import pkg from "../../package.json";

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:org,project&description=Planche";

const scopes = [
  { name: "repo", why: "Read issues and pull requests" },
  { name: "read:org", why: "List your organizations" },
  { name: "project", why: "Read and move project cards" },
];

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "valid"; auth: AuthStatus; projects: ProjectList }
  | { state: "error"; message: string };

/** The first launch: a token, then a project. The window grows to the board size at the end. */
export function Onboarding({ signedIn }: { signedIn: boolean }) {
  const [step, setStep] = useState<1 | 2>(signedIn ? 2 : 1);
  return (
    <div className="grid h-screen grid-cols-[270px_minmax(0,1fr)] bg-bg-sunken">
      <aside
        data-tauri-drag-region
        className="flex flex-col gap-[18px] px-[30px] pt-[72px] pb-[26px]"
      >
        <AppIcon size={64} />
        <div className="flex flex-col gap-1.5">
          <Logotype />
          <p className="text-pretty text-fg-2 leading-[18px]">
            Your GitHub Projects, keyboard-first.
          </p>
        </div>
        <span className="flex-1" />
        <span className="text-[11.5px] text-fg-3 tabular-nums">v{pkg.version} · macOS 15+</span>
      </aside>
      {step === 1 ? <TokenStep onDone={() => setStep(2)} /> : <ProjectStep />}
    </div>
  );
}

function StepHeader({ step, title, children }: { step: 1 | 2; title: string; children: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-medium text-[12px] text-fg-3">Step {step} of 2</div>
      <h1 className="font-semibold text-xl tracking-[-0.018em]">{title}</h1>
      <p className="max-w-[440px] text-pretty text-fg-2 leading-[19px]">{children}</p>
    </div>
  );
}

const panelClass =
  "my-2 mr-2 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto rounded-xl bg-bg px-10 pt-9 pb-[18px] shadow-panel";

function TokenStep({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (check.state === "valid") {
      return onDone();
    }
    if (!token.trim() || check.state === "checking") {
      return;
    }
    setCheck({ state: "checking" });
    try {
      const auth = await commands.authSetToken(token.trim());
      const projects = await commands.listProjects();
      queryClient.setQueryData(authQuery.queryKey, auth);
      setCheck({ state: "valid", auth, projects });
    } catch (error) {
      setCheck({ state: "error", message: errorMessage(error) });
    }
  }

  const scopeState: ScopeState = { idle: "idle", checking: "checking", valid: "ok", error: "idle" }[
    check.state
  ] as ScopeState;
  const projectCount =
    check.state === "valid" ? check.projects.owners.reduce((n, o) => n + o.projects.length, 0) : 0;
  return (
    <form
      className={panelClass}
      onSubmit={verify}
    >
      <StepHeader
        step={1}
        title="Connect your GitHub account"
      >
        Paste a personal access token. Planche stores it in your macOS Keychain and only talks to
        api.github.com.
      </StepHeader>
      <Field className="gap-1.5">
        <label
          htmlFor="token"
          className="font-semibold text-fg-2 text-xs"
        >
          Personal access token
        </label>
        <Input
          id="token"
          type="password"
          mono
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="ghp_…"
          className="h-[34px] w-full"
          value={token}
          invalid={check.state === "error"}
          readOnly={check.state === "checking" || check.state === "valid"}
          onChange={(e) => {
            setToken(e.target.value);
            if (check.state === "error") {
              setCheck({ state: "idle" });
            }
          }}
          suffix={<TokenStatus check={check} />}
        />
        {check.state === "error" ? <FieldMessage>{check.message}</FieldMessage> : null}
        <button
          type="button"
          onClick={() => openUrl(TOKEN_URL)}
          className="flex w-max items-center gap-[3px] rounded-[4px] text-fg-2 text-sm underline decoration-line-strong underline-offset-[3px] outline-none focus-visible:shadow-ring"
        >
          Create a token with the right scopes
          <ArrowUpRight
            className="size-3.5"
            aria-hidden
          />
        </button>
      </Field>
      {check.state === "valid" ? (
        <AccountBlock
          login={check.auth.login ?? ""}
          avatarUrl={check.auth.avatar_url ?? undefined}
          projects={projectCount}
        />
      ) : null}
      <div className="flex flex-col gap-0.5">
        <div className="mb-1 font-semibold text-fg-2 text-xs">Required scopes</div>
        {scopes.map((scope) => (
          <ScopeRow
            key={scope.name}
            name={scope.name}
            why={scope.why}
            state={scopeState}
          />
        ))}
      </div>
      {check.state === "valid" && check.projects.sso_blocked.length > 0 ? (
        <SsoNote orgs={check.projects.sso_blocked} />
      ) : null}
      <span className="flex-1" />
      <Footer>
        <Button
          type="submit"
          variant={check.state === "valid" ? "primary" : "secondary"}
          disabled={check.state === "checking" || (check.state !== "valid" && !token.trim())}
          autoFocus={check.state === "valid"}
          ref={(button) => {
            if (check.state === "valid") {
              button?.focus();
            }
          }}
        >
          Continue
          <Kbd variant={check.state === "valid" ? "onAccent" : "default"}>↵</Kbd>
        </Button>
      </Footer>
    </form>
  );
}

function TokenStatus({ check }: { check: Check }) {
  if (check.state === "checking") {
    return (
      <span className="flex items-center gap-1.5 text-fg-3 text-xs">
        <Spinner size={11} />
        Checking…
      </span>
    );
  }
  if (check.state === "valid") {
    return (
      <span className="flex items-center gap-1 font-medium text-success text-xs">
        {/* Inline, because the field colors every icon inside it. */}
        <CircleCheck
          className="fill-success"
          style={{ color: "var(--pl-bg)" }}
        />
        Valid
      </span>
    );
  }
  return null;
}

function SsoNote({ orgs }: { orgs: string[] }) {
  return (
    <div
      data-slot="sso-note"
      className="flex flex-col gap-1 rounded-lg bg-bg-sunken px-3 py-2.5 text-xs"
    >
      <span className="font-semibold">SAML SSO blocks {orgs.join(", ")}</span>
      <span className="text-fg-2">
        Open github.com/settings/tokens, choose Configure SSO next to this token, and authorize each
        organization. Their projects appear after that.
      </span>
    </div>
  );
}

function ProjectStep() {
  const queryClient = useQueryClient();
  const projects = useProjects();
  const selectProject = useUi((s) => s.selectProject);
  const [picked, setPicked] = useState<ProjectId | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(event: FormEvent) {
    event.preventDefault();
    if (!picked) {
      return;
    }
    setOpening(true);
    try {
      await commands.openProject(picked);
      await growWindow();
      queryClient.setQueryData(currentProjectQuery.queryKey, picked);
      selectProject(picked);
    } catch (e) {
      setError(errorMessage(e));
      setOpening(false);
    }
  }

  return (
    <form
      className={panelClass}
      onSubmit={open}
    >
      <StepHeader
        step={2}
        title="Pick a project"
      >
        Planche opens this board first. You can switch projects from the sidebar at any time.
      </StepHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        {projects.isPending ? <Spinner /> : null}
        {projects.data?.owners.map((owner) => {
          const open = owner.projects.filter((p) => !p.closed);
          if (open.length === 0) {
            return null;
          }
          return (
            <SidebarGroup
              key={owner.login}
              title={owner.login}
            >
              {open.map((project) => (
                <SidebarItem
                  key={project.id}
                  name={project.title}
                  tone={picked === project.id ? "done" : "backlog"}
                  count={project.number}
                  active={picked === project.id}
                  onClick={() => setPicked(project.id)}
                  onDoubleClick={() => setPicked(project.id)}
                />
              ))}
            </SidebarGroup>
          );
        })}
        {error ? <FieldMessage>{error}</FieldMessage> : null}
      </div>
      <Footer>
        <Button
          type="submit"
          variant="primary"
          disabled={!picked || opening}
        >
          {opening ? (
            <Spinner
              size={11}
              className="text-primary-fg"
            />
          ) : null}
          Open board
          <Kbd variant="onAccent">↵</Kbd>
        </Button>
      </Footer>
    </form>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        className="h-[30px] text-fg-2"
        onClick={() => getCurrentWindow().close()}
      >
        Quit
      </Button>
      {children}
    </div>
  );
}

/** From the 780×540 onboarding to the 1440×900 board window. */
async function growWindow() {
  const window = getCurrentWindow();
  await window.setMinSize(new LogicalSize(1100, 700));
  await window.setSize(new LogicalSize(1440, 900));
  await window.center();
}
