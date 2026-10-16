import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn(
				"relative flex w-full flex-col overflow-hidden rounded-window bg-elevated text-fg shadow-pop",
				className,
			)}
			{...props}
		/>
	);
}

function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div className="flex h-[50px] items-center gap-2.5 border-line border-b px-3.5">
			<Search className="size-4 shrink-0 text-fg-3" />
			<CommandPrimitive.Input
				data-slot="command-input"
				className={cn(
					"h-full min-w-0 flex-1 bg-transparent text-[16px] leading-5 outline-none placeholder:text-fg-3 focus-visible:shadow-none",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn("max-h-[360px] overflow-y-auto p-1.5", className)}
			{...props}
		/>
	);
}

function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
	return (
		<CommandPrimitive.Empty
			data-slot="command-empty"
			className={cn("py-6 text-center text-fg-3 text-sm", className)}
			{...props}
		/>
	);
}

function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			data-slot="command-group"
			className={cn(
				"flex flex-col gap-px overflow-hidden text-fg",
				"[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-[26px] [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:text-fg-3",
				className,
			)}
			{...props}
		/>
	);
}

function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"flex h-[34px] cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-base outline-none",
				"data-[disabled=true]:pointer-events-none data-[disabled=true]:text-fg-3",
				"data-[preview~=hover]:bg-active data-[selected=true]:bg-active",
				"[&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

function CommandShortcut({ className, ...props }: ComponentProps<"span">) {
	return (
		<span data-slot="command-shortcut" className={cn("ml-auto flex items-center gap-[3px]", className)} {...props} />
	);
}

function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
	return (
		<CommandPrimitive.Separator
			data-slot="command-separator"
			className={cn("-mx-1.5 my-1 h-px bg-line", className)}
			{...props}
		/>
	);
}

function CommandDialog({ children, ...props }: ComponentProps<typeof Dialog>) {
	return (
		<Dialog {...props}>
			<DialogContent
				showClose={false}
				className="top-[120px] w-[640px] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-window bg-elevated p-0 shadow-pop"
			>
				<DialogTitle className="sr-only">Command palette</DialogTitle>
				<DialogDescription className="sr-only">Search actions, issues, and pull requests.</DialogDescription>
				<Command className="rounded-none bg-transparent shadow-none">{children}</Command>
			</DialogContent>
		</Dialog>
	);
}

export {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
};
