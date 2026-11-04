import { useQueryClient } from "@tanstack/react-query";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, CircleCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldMessage, Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  AccountBlock,
  AppIcon,
  GitHubSignIn,
  OnboardingIntro,
  PersonalTokenOption,
  ProjectAccessState,
  ScopeRow,
  type ScopeState,
} from "@/components/ui/onboarding";
import { SidebarGroup, SidebarItem } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { type AuthStatus, commands, type DeviceCode, type ProjectId } from "@/ipc/bindings.types";
import {
  authQuery,
  currentProjectQuery,
  errorMessage,
  projectsQuery,
  useAuth,
  useProjects,
} from "@/ipc/queries";
import { RepositorySection } from "@/shell/Repositories";
import { useUi } from "@/stores/ui";
import { showUpdates } from "@/update/Updates";
import pkg from "../../package.json";

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:org,project&description=Planche";

const scopes = [
  { name: "repo", why: "Read/write repositories, including code" },
  { name: "read:org", why: "List your organizations" },
  { name: "project", why: "Read and move project cards" },
];

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "valid"; auth: AuthStatus }
  | { state: "error"; message: string };

/** The first launch: a GitHub account, then a project. */
export function Onboarding({ signedIn }: { signedIn: boolean }) {
  const [step, setStep] = useState<1 | 2>(signedIn ? 2 : 1);

  return (
    <div className="grid h-screen grid-cols-[270px_minmax(0,1fr)] bg-bg-sunken">
      <aside
        data-tauri-drag-region
        className="flex flex-col gap-[18px] px-[30px] pt-[72px] pb-[26px]"
      >
        <AppIcon size={64} />
        <OnboardingIntro />
        <span className="flex-1" />
        <span className="text-[11.5px] text-fg-3 tabular-nums">v{pkg.version} · macOS 15+</span>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={showUpdates}
        >
          Check for updates…
        </Button>
      </aside>
      {step === 1 ? (
        <SignInStep onDone={() => setStep(2)} />
      ) : (
        <ProjectStep onBack={() => setStep(1)} />
      )}
    </div>
  );
}

function StepHeader({ step, title, children }: { step: 1 | 2; title: string; children?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-medium text-[12px] text-fg-3">Step {step} of 2</div>
      <h1 className="font-semibold text-xl tracking-[-0.018em]">{title}</h1>
      {children ? (
        <p className="max-w-[440px] text-pretty text-fg-2 leading-[19px]">{children}</p>
      ) : null}
    </div>
  );
}

const panelClass =
  "my-2 mr-2 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto rounded-xl bg-bg px-10 pt-9 pb-[18px] shadow-panel";

function SignInStep({ onDone }: { onDone: () => void }) {
  const [manual, setManual] = useState(false);
  const [organizations, setOrganizations] = useState(false);

  return manual ? (
    <TokenStep
      onDone={onDone}
      onBack={() => setManual(false)}
    />
  ) : (
    <GitHubStep
      key={organizations ? "organizations" : "personal"}
      organizations={organizations}
      onDone={onDone}
      onManual={() => (organizations ? setOrganizations(false) : setManual(true))}
      onOrganizations={() => setOrganizations(true)}
    />
  );
}

export function GitHubStep({
  onDone,
  onManual,
  onOrganizations,
  organizations = false,
  embedded = false,
}: {
  onDone: () => void;
  onManual: () => void;
  onOrganizations?: () => void;
  organizations?: boolean;
  embedded?: boolean;
}) {
  const client = useQueryClient();
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [starting, setStarting] = useState(false);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const generation = useRef(0);
  const continueButton = useRef<HTMLButtonElement>(null);
  const pending = starting || device !== null;

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (auth) {
      continueButton.current?.focus();
    }
  }, [auth]);
  useEffect(() => {
    if (!device) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await commands.authOauthPoll(device.user_code);

        if (!active) {
          return;
        }
        if (status) {
          await client.cancelQueries({ queryKey: projectsQuery.queryKey });

          if (!active) {
            return;
          }
          client.removeQueries({ queryKey: projectsQuery.queryKey });
          client.setQueryData(authQuery.queryKey, status);
          setAuth(status);
          setDevice(null);
          if (organizations) {
            for (const family of ["repositories", "repository", "repository-catalog"]) {
              await client.invalidateQueries({ queryKey: [family] });
            }
            await client.invalidateQueries({ queryKey: ["issue"] });
            const selected =
              useUi.getState().projectId ?? client.getQueryData(currentProjectQuery.queryKey);
            if (selected) {
              await commands.openProject(selected);
            }
          }
        } else {
          timer = setTimeout(poll, device.interval * 1000);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setError(errorMessage(error));
        setDevice(null);
      }
    };

    timer = setTimeout(poll, device.interval * 1000);

    return () => {
      active = false;
      clearTimeout(timer);
      void commands.authOauthCancel(device.user_code).catch(() => {});
    };
  }, [device, client, organizations]);

  async function start() {
    if (pending) {
      return;
    }

    const attempt = ++generation.current;
    setStarting(true);
    setError(undefined);
    setCopied(false);

    try {
      const code = await (organizations
        ? commands.authOrganizationsStart()
        : commands.authOauthStart());

      if (generation.current !== attempt) {
        await commands.authOauthCancel(code.user_code);
        return;
      }

      setDevice(code);
      await copyCode(code.user_code);

      if (generation.current === attempt) {
        await openGitHub();
      }
    } catch (error) {
      if (generation.current === attempt) {
        setError(errorMessage(error));
      }
    } finally {
      if (generation.current === attempt) {
        setStarting(false);
      }
    }
  }

  function cancel() {
    generation.current++;
    setStarting(false);
    setDevice(null);
    setCopied(false);
  }

  async function copyCode(code: string) {
    const attempt = generation.current;

    try {
      await commands.authOauthCopyCode(code);

      if (generation.current === attempt) {
        setCopied(true);
        setError(undefined);
      }
    } catch (error) {
      if (generation.current === attempt) {
        setCopied(false);
        setError(errorMessage(error));
      }
    }
  }

  async function openGitHub() {
    try {
      await openUrl("https://github.com/login/device");
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return (
    <form
      className={embedded ? "flex flex-col gap-4 p-6" : panelClass}
      onSubmit={(event) => {
        event.preventDefault();
        if (auth) {
          onDone();
        }
      }}
    >
      {organizations ? (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-xl">Connect organizations</h2>
          <p className="text-fg-2">
            Authorize Planche with the same GitHub account. Your personal connection stays active.
          </p>
        </div>
      ) : (
        <>
          <StepHeader
            step={1}
            title="Connect to GitHub"
          />
          <p className="text-fg-2">
            Connect your personal projects with project access only. Organization access is added
            separately.
          </p>
        </>
      )}
      <GitHubSignIn
        pending={pending}
        code={device?.user_code}
        copied={copied}
        error={error}
        connected={auth !== null}
        onSignIn={() => void start()}
        onCopy={() => {
          if (device) {
            void copyCode(device.user_code);
          }
        }}
        onOpen={() => {
          if (device) {
            void copyCode(device.user_code).then(openGitHub);
          }
        }}
        onCancel={cancel}
      />
      {!organizations && !auth && !pending ? <PersonalTokenOption onSelect={onManual} /> : null}
      {auth ? (
        <AccountBlock
          login={auth.login ?? ""}
          avatarUrl={auth.avatar_url ?? undefined}
        />
      ) : null}
      {!organizations &&
      auth?.mode === "oauth" &&
      auth.organizations_available &&
      onOrganizations ? (
        <Button
          type="button"
          onClick={onOrganizations}
        >
          Connect organizations…
        </Button>
      ) : null}
      <span className="flex-1" />
      {organizations ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={onManual}
          >
            {embedded ? "Cancel" : "Back"}
          </Button>
          {auth ? (
            <Button
              type="submit"
              variant="primary"
              ref={continueButton}
            >
              Continue<Kbd variant="onAccent">↵</Kbd>
            </Button>
          ) : null}
        </div>
      ) : (
        <Footer>
          {auth ? (
            <Button
              type="submit"
              variant="primary"
              ref={continueButton}
            >
              Continue<Kbd variant="onAccent">↵</Kbd>
            </Button>
          ) : null}
        </Footer>
      )}
    </form>
  );
}

function TokenStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const projects = useProjects(check.state === "valid");
  const tokenInput = useRef<HTMLInputElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (check.state === "valid") {
      continueButton.current?.focus();
    } else if (check.state === "error") {
      tokenInput.current?.focus();
    }
  }, [check.state]);

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

      await queryClient.cancelQueries({ queryKey: projectsQuery.queryKey });
      queryClient.removeQueries({ queryKey: projectsQuery.queryKey });
      queryClient.setQueryData(authQuery.queryKey, auth);
      setCheck({ state: "valid", auth });
    } catch (error) {
      setCheck({ state: "error", message: errorMessage(error) });
    }
  }

  const scopeState: ScopeState = { idle: "idle", checking: "checking", valid: "ok", error: "idle" }[
    check.state
  ] as ScopeState;
  const projectCount = projects.isSuccess
    ? projects.data?.owners.reduce((n, o) => n + o.projects.filter((p) => !p.closed).length, 0)
    : undefined;

  return (
    <form
      className={panelClass}
      onSubmit={verify}
    >
      <StepHeader
        step={1}
        title="Connect your GitHub account"
      >
        Use a classic PAT. It is saved encrypted in macOS Keychain on this Mac.
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
          ref={tokenInput}
          type="password"
          mono
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="ghp_…"
          className="h-[34px] w-full"
          value={token}
          invalid={check.state === "error"}
          aria-describedby={check.state === "error" ? "token-error" : undefined}
          readOnly={check.state === "checking" || check.state === "valid"}
          onChange={(e) => {
            setToken(e.target.value);

            if (check.state === "error") {
              setCheck({ state: "idle" });
            }
          }}
          suffix={
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <TokenStatus check={check} />
            </span>
          }
        />
        {check.state === "error" ? (
          <FieldMessage
            id="token-error"
            role="alert"
          >
            {check.message}
          </FieldMessage>
        ) : null}
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
      <span className="flex-1" />
      <Footer>
        <Button
          type="button"
          disabled={check.state === "checking"}
          onClick={onBack}
        >
          Use GitHub sign-in
        </Button>
        <Button
          type="submit"
          variant={check.state === "valid" ? "primary" : "secondary"}
          disabled={check.state === "checking" || (check.state !== "valid" && !token.trim())}
          ref={continueButton}
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

function ProjectStep({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const projects = useProjects();
  const auth = useAuth();
  const [connecting, setConnecting] = useState(false);
  const selectProject = useUi((s) => s.selectProject);
  const [picked, setPicked] = useState<ProjectId | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = projects.data?.owners.flatMap((o) => o.projects).filter((p) => !p.closed) ?? [];
  const blocked = projects.data?.sso_blocked ?? [];
  const retry = () => {
    if (!projects.isFetching) {
      void projects.refetch();
    }
  };

  async function open(event: FormEvent) {
    event.preventDefault();

    if (opening || !picked || !available.some((p) => p.id === picked)) {
      return;
    }

    setOpening(true);
    setError(null);

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

  if (connecting) {
    return (
      <GitHubStep
        organizations
        onDone={() => setConnecting(false)}
        onManual={() => setConnecting(false)}
      />
    );
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
      {auth.data?.mode === "oauth" && auth.data.organizations_available ? (
        <Button
          type="button"
          onClick={() => setConnecting(true)}
        >
          {auth.data.organizations_connected
            ? "Reconnect organizations…"
            : "Connect organizations…"}
        </Button>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        {projects.isFetching ? (
          <span
            role="status"
            className="flex items-center gap-2 text-fg-3"
          >
            <Spinner />
            Loading projects…
          </span>
        ) : null}
        {projects.error ? (
          <ProjectAccessState
            state="error"
            message={errorMessage(projects.error)}
            pending={projects.isFetching}
            onRetry={retry}
          />
        ) : null}
        {blocked.length > 0 ? (
          <ProjectAccessState
            state="sso"
            message={blocked.join(", ")}
            pending={projects.isFetching}
            onRetry={retry}
            onAuthorize={() =>
              void openUrl(`https://github.com/orgs/${encodeURIComponent(blocked[0])}/sso`)
            }
          />
        ) : null}
        {projects.isSuccess && available.length === 0 && blocked.length === 0 ? (
          <ProjectAccessState
            state="empty"
            pending={projects.isFetching}
            onRetry={retry}
            onAuthorize={() => void openUrl("https://github.com/projects")}
          />
        ) : null}
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
        {error ? <FieldMessage role="alert">{error}</FieldMessage> : null}
        <RepositorySection />
      </div>
      <Footer>
        <Button
          type="button"
          disabled={opening}
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!available.some((p) => p.id === picked) || opening}
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
