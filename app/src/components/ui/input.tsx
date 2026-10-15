import { cva } from "class-variance-authority";
import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const fieldVariants = cva(
	[
		"flex h-control w-48 max-w-full items-center gap-1.5 rounded-md bg-surface px-2",
		"shadow-[inset_0_0_0_1px_var(--pl-border-strong)]",
		"transition-[background-color,box-shadow]",
		"hover:bg-hover",
		"focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--pl-focus),0_0_0_3px_var(--pl-accent-soft)]",
		"has-[:disabled]:pointer-events-none has-[:disabled]:bg-active has-[:disabled]:shadow-none",
		"[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-3",
	],
	{
		variants: {
			invalid: {
				true: [
					"shadow-[inset_0_0_0_1px_var(--pl-danger)]",
					"hover:bg-surface hover:shadow-[inset_0_0_0_1px_var(--pl-danger)]",
					"focus-within:shadow-[inset_0_0_0_1px_var(--pl-danger)]",
				],
				false: "",
			},
		},
		defaultVariants: { invalid: false },
	},
);

export type InputProps = ComponentProps<"input"> & {
	icon?: ReactNode;
	/** Trailing content inside the field, such as a status. */
	suffix?: ReactNode;
	mono?: boolean;
	invalid?: boolean;
	"data-preview"?: string;
};

export function Input({
	className,
	icon,
	suffix,
	mono = false,
	invalid = false,
	disabled,
	"data-preview": dataPreview,
	...props
}: InputProps) {
	return (
		<div
			data-slot="input"
			data-invalid={invalid || undefined}
			data-preview={dataPreview}
			className={cn(fieldVariants({ invalid }), className)}
		>
			{icon}
			<input
				disabled={disabled}
				aria-invalid={invalid || undefined}
				className={cn(
					"min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3 disabled:text-fg-3",
					mono && "font-mono text-sm",
				)}
				{...props}
			/>
			{suffix}
		</div>
	);
}

export function Field({ className, ...props }: ComponentProps<"div">) {
	return <div data-slot="field" className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function FieldMessage({ className, children, ...props }: ComponentProps<"p">) {
	return (
		<p
			data-slot="field-message"
			className={cn("flex items-center gap-1 text-[11.5px] text-danger leading-[14px]", className)}
			{...props}
		>
			<CircleAlert className="size-3.5 shrink-0" />
			{children}
		</p>
	);
}
