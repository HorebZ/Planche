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

/** The "Planche" wordmark (Inter Tight 600, outlined), inline so it takes the theme. */
export function Logotype({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      data-slot="logotype"
      viewBox="88 -1510 6858.92 1553"
      role="img"
      aria-label="Planche"
      className={cn("h-6 w-[106px] shrink-0", className)}
      {...props}
    >
      <g className="fill-logo-ink">
        <path
          transform="translate(0 0) scale(1 -1)"
          d="M108 0V1490H667Q839 1490 955.5 1426Q1072 1362 1132 1250Q1192 1138 1192 996Q1192 853 1131.5 741.5Q1071 630 953 566.5Q835 503 663 503H293V725H626Q727 725 791.5 759.5Q856 794 886.5 855.5Q917 917 917 996Q917 1076 886.5 1136.5Q856 1197 791.5 1230.5Q727 1264 625 1264H378V0Z"
        />
        <path
          transform="translate(1169.32 0) scale(1 -1)"
          d="M360 1490V0H97V1490Z"
        />
        <path
          transform="translate(1554.64 0) scale(1 -1)"
          d="M419 -23Q312 -23 227 15.5Q142 54 93 129Q44 204 44 314Q44 408 79 470Q114 532 174.5 569Q235 606 311 625.5Q387 645 468 653Q567 664 628 672Q689 680 716.5 698Q744 716 744 754V759Q744 840 696 885Q648 930 556 930Q459 930 402.5 888Q346 846 326 789L81 824Q110 926 177 994.5Q244 1063 340.5 1097.5Q437 1132 554 1132Q634 1132 714 1113.5Q794 1095 861 1051Q928 1007 968 933Q1008 859 1008 748V0H755V154H747Q723 108 679.5 67.5Q636 27 571.5 2Q507 -23 419 -23ZM486 171Q566 171 624 202.5Q682 234 714 286.5Q746 339 746 401V532Q733 522 704 513.5Q675 505 638 498Q601 491 565.5 486Q530 481 504 478Q445 470 398.5 451.5Q352 433 325 401Q298 369 298 318Q298 245 351 208Q404 171 486 171Z"
        />
        <path
          transform="translate(2588.96 0) scale(1 -1)"
          d="M360 654V0H97V1118H355V927H368Q406 1021 487.5 1076.5Q569 1132 695 1132Q811 1132 897 1083Q983 1034 1030.5 939.5Q1078 845 1078 711V0H815V670Q815 782 757 845.5Q699 909 597 909Q528 909 474.5 879Q421 849 390.5 792.5Q360 736 360 654Z"
        />
        <path
          transform="translate(3692.28 0) scale(1 -1)"
          d="M584 -22Q417 -22 297 51.5Q177 125 113 255Q49 385 49 554Q49 725 114 855Q179 985 299 1058.5Q419 1132 582 1132Q719 1132 824 1082Q929 1032 991.5 941.5Q1054 851 1063 730H811Q801 784 772 827Q743 870 696.5 895Q650 920 586 920Q505 920 444.5 876.5Q384 833 350 752Q316 671 316 558Q316 444 349 361.5Q382 279 443 234.5Q504 190 586 190Q673 190 733.5 241Q794 292 811 382H1063Q1054 263 993 172Q932 81 828 29.5Q724 -22 584 -22Z"
        />
        <path
          transform="translate(4728.6 0) scale(1 -1)"
          d="M360 654V0H97V1490H354V927H368Q407 1022 489 1077Q571 1132 700 1132Q816 1132 902.5 1083Q989 1034 1037 940Q1085 846 1085 711V0H821V670Q821 784 763 846.5Q705 909 601 909Q531 909 476.5 879Q422 849 391 792.5Q360 736 360 654Z"
        />
        <path
          transform="translate(5838.92 0) scale(1 -1)"
          d="M592 -22Q424 -22 302 48.5Q180 119 114.5 248Q49 377 49 552Q49 725 114 855.5Q179 986 297 1059Q415 1132 575 1132Q678 1132 770.5 1099Q863 1066 934.5 997Q1006 928 1047 821.5Q1088 715 1088 568V486H172V663H957L834 611Q834 706 805 776.5Q776 847 719 887Q662 927 577 927Q492 927 432 887Q372 847 341 779.5Q310 712 310 629V506Q310 404 345.5 331.5Q381 259 445.5 221Q510 183 596 183Q652 183 698.5 199Q745 215 778.5 247.5Q812 280 830 328L1076 299Q1052 202 987.5 129.5Q923 57 822.5 17.5Q722 -22 592 -22Z"
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
      <p className="text-fg-3 text-xs">Saved encrypted in macOS Keychain on this Mac.</p>
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
