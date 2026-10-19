import { CircleCheck, CircleX } from "lucide-react";
import type { ComponentProps } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import icon from "../../../../design/brand/icon/planche-icon-flat.svg";
import smallIcon from "../../../../design/brand/icon/planche-icon-small.svg";

/** The full-bleed app icon from design/brand/icon, as the onboarding shows it. */
export function AppIcon({ size = 64, className, style, ...props }: ComponentProps<"img"> & { size?: number }) {
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

/** The "PLANCHE." wordmark from design/brand/logotype, inline so it takes the theme. */
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
				<path transform="translate(544.53 0) scale(1 -1)" d="M50 0L50 688L228 688L228 150L468 150L468 0Z" />
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
			<span aria-hidden className="grid w-4 place-items-center">
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

type AccountBlockProps = ComponentProps<"div"> & { login: string; avatarUrl?: string; projects: number };

export function AccountBlock({ login, avatarUrl, projects, className, ...props }: AccountBlockProps) {
	return (
		<div
			data-slot="account-block"
			className={cn("flex items-center gap-2.5 rounded-lg bg-bg-sunken px-3 py-2.5", className)}
			{...props}
		>
			<Avatar src={avatarUrl} alt={login} size={20} className="size-7 text-[11px]" />
			<div className="flex min-w-0 flex-col">
				<span className="font-semibold">{login}</span>
				<span className="text-fg-3 text-xs">
					Signed in as <span>{login}</span> · {projects} {projects === 1 ? "project" : "projects"} found
				</span>
			</div>
		</div>
	);
}
