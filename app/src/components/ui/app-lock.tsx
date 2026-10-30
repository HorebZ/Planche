import { Fingerprint } from "lucide-react";
import { SkeletonColumn } from "@/components/ui/board-states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AppIcon } from "@/components/ui/onboarding";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type LockProps = { pending: boolean; error?: string; onUnlock: () => void };

export function AppLockContent({ pending, error, onUnlock }: LockProps) {
	return (
		<div data-slot="app-lock" className="flex flex-col items-center gap-4 text-center" aria-busy={pending}>
			<AppIcon size={48} />
			<div className="flex flex-col gap-1.5">
				<h1 className="font-semibold text-lg">Planche is locked</h1>
				<p className="text-fg-2 text-sm">Unlock with macOS to access your projects.</p>
				<p className="text-fg-3 text-xs">Touch ID when available, or your Mac password.</p>
			</div>
			{error ? (
				<p role="alert" className="text-danger text-xs">
					{error}
				</p>
			) : null}
			<Button variant="primary" disabled={pending} onClick={onUnlock}>
				{pending ? <Spinner size={16} /> : <Fingerprint />}
				{pending ? "Unlocking…" : "Unlock Planche"}
			</Button>
		</div>
	);
}

/** The window is visible before macOS asks to read the protected credential. */
export function LockedApp(props: LockProps) {
	return (
		<>
			<div inert aria-hidden className="flex h-screen overflow-hidden bg-bg-sunken">
				<aside className="flex w-sidebar shrink-0 flex-col gap-5 px-3 pt-[42px]">
					<div className="flex items-center gap-2">
						<AppIcon size={18} />
						<span className="font-semibold">Planche</span>
					</div>
					{[0, 1, 2, 3].map((key) => (
						<Skeleton key={key} className="h-5 w-full" />
					))}
				</aside>
				<main className="my-2 mr-2 flex min-w-0 flex-1 flex-col gap-5 overflow-hidden rounded-xl bg-bg p-3 shadow-panel">
					<div data-tauri-drag-region className="flex h-20 flex-col justify-center gap-3">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-6 w-56" />
					</div>
					<div className="flex gap-2.5">
						{[0, 1, 2, 3, 4].map((key) => (
							<SkeletonColumn key={key} cards={3} />
						))}
					</div>
				</main>
			</div>
			<Dialog open>
				<DialogContent
					showClose={false}
					onEscapeKeyDown={(event) => event.preventDefault()}
					onInteractOutside={(event) => event.preventDefault()}
				>
					<DialogTitle className="sr-only">Unlock Planche</DialogTitle>
					<DialogDescription className="sr-only">Authenticate with macOS to access your projects.</DialogDescription>
					<AppLockContent {...props} />
				</DialogContent>
			</Dialog>
		</>
	);
}
