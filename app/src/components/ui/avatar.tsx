import { cva, type VariantProps } from "class-variance-authority";
import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const avatarVariants = cva(
  "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-active font-bold text-fg-2 leading-none",
  {
    variants: {
      size: {
        16: "size-4 text-[7px]",
        18: "size-[18px] text-[8px]",
        20: "size-5 text-[8.5px]",
      },
    },
    defaultVariants: { size: 18 },
  },
);

export type AvatarSize = NonNullable<VariantProps<typeof avatarVariants>["size"]>;

export type AvatarUser = {
  login: string;
  avatarUrl?: string;
};

function initials(name: string) {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const first = parts[0];

  if (!first) {
    return "";
  }

  const second = parts[1];

  if (!second) {
    return first.slice(0, 2).toUpperCase();
  }

  return (first[0] + second[0]).toUpperCase();
}

type AvatarProps = Omit<ComponentProps<typeof AvatarPrimitive.Root>, "children"> & {
  src?: string;
  alt: string;
  size?: AvatarSize;
};

export function Avatar({ src, alt, size = 18, className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(avatarVariants({ size }), className)}
      {...props}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt={alt}
          className="size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback>{initials(alt)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

type AvatarStackProps = Omit<ComponentProps<"div">, "children"> & {
  users: AvatarUser[];
  size?: AvatarSize;
  /** The background the stack sits on, which the ring between avatars matches. */
  on?: "surface" | "bg";
};

export function AvatarStack({
  users,
  size = 20,
  on = "surface",
  className,
  ...props
}: AvatarStackProps) {
  return (
    <div
      data-slot="avatar-stack"
      className={cn("flex", className)}
      {...props}
    >
      {users.map((user, index) => (
        <span
          key={user.login}
          className={cn(
            "inline-flex rounded-full",
            on === "surface"
              ? "shadow-[0_0_0_2px_var(--pl-surface)]"
              : "shadow-[0_0_0_2px_var(--pl-bg)]",
            index > 0 && "-ml-1",
          )}
        >
          <Avatar
            src={user.avatarUrl}
            alt={user.login}
            size={size}
          />
        </span>
      ))}
    </div>
  );
}
