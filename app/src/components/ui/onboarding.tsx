import { ArrowUpRight, Check, CircleCheck, CircleX, Copy } from "lucide-react";
import type { ComponentProps } from "react";
import icon from "@/assets/brand/planche-icon-flat.svg";
import smallIcon from "@/assets/brand/planche-icon-small.svg";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

/** The full-bleed app icon shown during onboarding. */
export function AppIcon({
  size = 64,
  className,
  style,
  ...props
}: ComponentProps<"img"> & { size?: number }) {
  return (
    <img
      src={size < 32 ? smallIcon : icon}
      width={size}
      height={size}
      alt=""
      className={cn("shrink-0 shadow-pop", className)}
      // The icon's corner radius, 22.37 % of its side, so the shadow follows the squircle.
      style={{ borderRadius: size * 0.2237, ...style }}
      {...props}
    />
  );
}

/** The "PLANCHE." wordmark, inline so it takes the theme. */
export function Logotype({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      data-slot="logotype"
      viewBox="-32.6 -770.6 4226.5 853.1"
      role="img"
      aria-label="Planche"
      className={cn("h-7 w-[112px] shrink-0", className)}
      {...props}
    >
      <g className="fill-logo-ink">
        <path
          transform="translate(0.00 0) scale(1 -1)"
          d="M50 0L50 688L338 688Q404 688 446.5 660Q489 632 508.5 580Q528 528 528 460Q528 390 507 336.5Q486 283 443.5 253.5Q401 224 337 224L228 224L228 0ZM228 365L296 365Q326 365 338.5 390Q351 415 351 456Q351 484 346 504Q341 524 328 534.5Q315 545 294 545L228 545Z"
        />
        <path
          transform="translate(544.53 0) scale(1 -1)"
          d="M50 0L50 688L228 688L228 150L468 150L468 0Z"
        />
        <path
          transform="translate(1029.98 0) scale(1 -1)"
          d="M2 0L174 688L406 688L578 0L392 0L369 113L205 113L183 0ZM232 254L343 254L313 411Q311 420 308.5 434.5Q306 449 303 467Q300 485 297 503Q294 521 292 536L283 536Q281 517 277 494.5Q273 472 269 450Q265 428 261 411Z"
        />
        <path
          transform="translate(1615.00 0) scale(1 -1)"
          d="M50 0L50 688L215 688L335 434Q340 424 346.5 411.5Q353 399 359 386Q365 373 369 359L374 360Q374 380 374 399.5Q374 419 374 434L374 688L540 688L540 0L376 0L250 259Q242 279 235 298Q228 317 222 336L217 336Q217 318 217 298Q217 278 217 259L217 0Z"
        />
        <path
          transform="translate(2211.29 0) scale(1 -1)"
          d="M301 -12Q208 -12 149.5 26.5Q91 65 63 144Q35 223 35 345Q35 526 103 613.5Q171 701 306 701Q381 701 434.5 671.5Q488 642 517 577.5Q546 513 546 410L375 410Q375 457 368.5 488.5Q362 520 345 536.5Q328 553 299 553Q266 553 247.5 536Q229 519 221.5 485Q214 451 214 398L214 289Q214 236 222.5 202Q231 168 249 151Q267 134 299 134Q328 134 346 150Q364 166 371.5 197Q379 228 379 274L545 274Q545 174 517 110.5Q489 47 434 17.5Q379 -12 301 -12Z"
        />
        <path
          transform="translate(2792.58 0) scale(1 -1)"
          d="M50 0L50 688L228 688L228 423L360 423L360 688L536 688L536 0L360 0L360 274L228 274L228 0Z"
        />
        <path
          transform="translate(3385.52 0) scale(1 -1)"
          d="M52 0L52 688L490 688L490 541L228 541L228 422L450 422L450 277L228 277L228 147L496 147L496 0Z"
        />
      </g>
    </svg>
  );
}

export function OnboardingIntro() {
  return (
    <div className="flex flex-col gap-3">
      <Logotype />
      <p className="text-pretty text-fg-2 leading-[19px]">
        A blazingly fast client for GitHub projects &amp; issues.
      </p>
      <p className="text-fg-3 text-xs">GitHub API permitting.</p>
    </div>
  );
}

export type ScopeState = "idle" | "checking" | "ok" | "missing";

type ScopeRowProps = ComponentProps<"div"> & { name: string; why: string; state: ScopeState };

export function ScopeRow({ name, why, state, className, ...props }: ScopeRowProps) {
  return (
    <div
      data-slot="scope-row"
      data-state={state}
      className={cn("flex h-6 items-center gap-2 text-[12.5px]", className)}
      {...props}
    >
      <span
        aria-hidden
        className="grid w-4 place-items-center"
      >
        {state === "ok" ? <CircleCheck className="size-4 fill-success text-bg" /> : null}
        {state === "checking" ? <Spinner size={11} /> : null}
        {state === "missing" ? <CircleX className="size-4 fill-danger text-bg" /> : null}
        {state === "idle" ? <span className="size-1.5 rounded-full bg-line-strong" /> : null}
      </span>
      <span className="w-[72px] font-sans text-xs">{name}</span>
      <span className="text-fg-3">{why}</span>
    </div>
  );
}

function GitHubLogo() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}

export function GitHubSignIn({
  pending,
  code,
  copied,
  error,
  connected,
  onSignIn,
  onCopy,
  onOpen,
  onCancel,
}: {
  pending: boolean;
  code?: string;
  copied: boolean;
  error?: string;
  connected: boolean;
  onSignIn: () => void;
  onCopy: () => void;
  onOpen: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-slot="github-sign-in"
      className="flex flex-col items-start gap-3"
    >
      {!connected ? (
        <p className="text-pretty text-fg-2 leading-[19px]">
          Connect through GitHub OAuth. Organizations using SSO may require additional authorization
          or admin approval.
        </p>
      ) : null}
      {code ? (
        <div className="flex w-full flex-col gap-3 rounded-lg bg-bg-sunken p-4">
          <div
            className="flex items-center gap-2 text-fg-2 text-xs"
            role="status"
          >
            <Spinner size={12} />
            Waiting for GitHub…
          </div>
          <p className="text-fg-2 text-xs">Paste this code on GitHub.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 gap-2 bg-card px-2.5"
              aria-label="Copy code"
              onClick={onCopy}
            >
              <output
                className="select-text font-mono font-semibold text-sm tracking-wider"
                aria-label="GitHub verification code"
              >
                {code}
              </output>
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
            <span
              className="text-fg-3 text-xs"
              role="status"
            >
              {copied ? "Code copied" : "Click to copy"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onOpen}
            >
              <GitHubLogo />
              Open GitHub
              <ArrowUpRight />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-fg-3"
              onClick={onCancel}
            >
              Cancel sign-in
            </Button>
          </div>
        </div>
      ) : connected ? null : (
        <div className="flex flex-col items-start gap-2.5">
          <Button
            type="button"
            size="sm"
            className="h-7 px-3"
            variant="primary"
            disabled={pending}
            onClick={onSignIn}
          >
            {pending ? <Spinner size={14} /> : <GitHubLogo />}
            {pending ? "Connecting…" : "Sign in with GitHub"}
          </Button>
          {pending ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCancel}
            >
              Cancel sign-in
            </Button>
          ) : null}
        </div>
      )}
      {error ? (
        <p
          role="alert"
          className="text-danger text-xs"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PersonalTokenOption({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 border-line border-t pt-4">
      <p className="text-fg-2 text-xs">
        Or use Classic PAT with <code>repo</code>, <code>read:org</code> and <code>project</code>.
      </p>
      <p className="text-fg-3 text-xs">Saved unencrypted in a private file on this Mac.</p>
      <Button
        type="button"
        size="sm"
        onClick={onSelect}
      >
        Use a personal access token
      </Button>
    </div>
  );
}

type AccountBlockProps = ComponentProps<"div"> & {
  login: string;
  avatarUrl?: string;
  projects?: number;
};

export function AccountBlock({
  login,
  avatarUrl,
  projects,
  className,
  ...props
}: AccountBlockProps) {
  return (
    <div
      data-slot="account-block"
      className={cn("flex items-center gap-2.5 rounded-lg bg-bg-sunken px-3 py-2.5", className)}
      {...props}
    >
      <Avatar
        src={avatarUrl}
        alt={login}
        size={20}
        className="size-7 text-[11px]"
      />
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold">{login}</span>
        <span className="text-fg-3 text-xs">
          Signed in as <span>{login}</span>
          {projects != null
            ? ` · ${projects} ${projects === 1 ? "project" : "projects"} found`
            : null}
        </span>
      </div>
    </div>
  );
}

export function ProjectAccessState({
  state,
  message,
  pending,
  onRetry,
  onAuthorize,
}: {
  state: "empty" | "error" | "sso";
  message?: string;
  pending: boolean;
  onRetry: () => void;
  onAuthorize?: () => void;
}) {
  return (
    <div
      data-slot="project-access-state"
      data-state={state}
      role={state === "error" ? "alert" : "status"}
      className="flex flex-col gap-2 rounded-lg bg-bg-sunken p-3 text-xs"
    >
      <h2 className="font-semibold">
        {state === "error"
          ? "Could not load projects"
          : state === "sso"
            ? "Organization access needs SSO"
            : "No open projects found"}
      </h2>
      <p className="break-words text-fg-2">
        {state === "error"
          ? message
          : state === "sso"
            ? `Sign in to ${message} through your organization's SSO, approve Planche if required, then reconnect your GitHub account. For a personal access token, use Configure SSO in GitHub's token settings.`
            : "Create a project on GitHub or check that this account can access one, then retry."}
      </p>
      <div className="flex flex-wrap gap-2">
        {state !== "error" && onAuthorize ? (
          <Button
            size="sm"
            onClick={onAuthorize}
          >
            {state === "sso" ? "Open organization SSO" : "Open GitHub Projects"}
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={pending}
          onClick={onRetry}
        >
          {pending ? "Retrying…" : "Retry now"}
        </Button>
      </div>
    </div>
  );
}
