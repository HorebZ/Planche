import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0",
    "font-medium text-sm transition-[background-color,box-shadow,color]",
    "disabled:pointer-events-none disabled:bg-active disabled:text-fg-3 disabled:shadow-none",
    "has-[>kbd]:pr-1.25 has-[>kbd]:pl-2.25 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-fg focus-visible:shadow-[0_0_0_2px_var(--pl-bg),0_0_0_4px_var(--pl-focus)]",
        secondary:
          "bg-card text-fg shadow-card focus-visible:shadow-[var(--pl-shadow-card),0_0_0_2px_var(--pl-focus)]",
        ghost: "bg-transparent text-fg hover:bg-hover focus-visible:shadow-ring",
        danger: "bg-transparent text-danger hover:bg-danger-soft focus-visible:shadow-ring",
      },
      size: {
        default: "h-control px-2.5 [&_svg]:size-4",
        sm: "h-6 px-2 [&_svg]:size-3.5",
        icon: "size-control text-fg-2 [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
