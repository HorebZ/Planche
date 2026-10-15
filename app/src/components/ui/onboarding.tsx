import { CircleCheck, CircleX } from "lucide-react";
import type { ComponentProps } from "react";
import icon from "@/assets/planche-icon.svg";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

export function AppIcon({ size = 64, className, ...props }: ComponentProps<"img"> & { size?: number }) {
	return <img src={icon} width={size} height={size} alt="" className={cn("shrink-0", className)} {...props} />;
}

/** "PLANCHE" in the embedded Archivo, so it renders offline. */
export function Logotype({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="logotype"
			className={cn("font-[850] font-logo text-[28px] uppercase leading-7 tracking-[0.005em]", className)}
			{...props}
		>
			Planche
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
			<span aria-hidden className="grid w-4 place-items-center">
				{state === "ok" ? <CircleCheck className="size-4 fill-success text-bg" /> : null}
				{state === "checking" ? <Spinner size={11} /> : null}
				{state === "missing" ? <CircleX className="size-4 fill-danger text-bg" /> : null}
				{state === "idle" ? <span className="size-1.5 rounded-full bg-line-strong" /> : null}
			</span>
			<span className="w-[72px] font-mono text-xs">{name}</span>
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
					Signed in as <span className="font-mono">{login}</span> · {projects} {projects === 1 ? "project" : "projects"}{" "}
					found
				</span>
			</div>
		</div>
	);
}
