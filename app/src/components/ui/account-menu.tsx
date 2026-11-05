import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarAccount } from "@/components/ui/sidebar";
import type { AuthMode, SavedAccount } from "@/ipc/bindings.types";

export const authModeLabel = (mode: AuthMode) =>
  mode === "pat" ? "PAT" : mode === "oauth" ? "OAuth" : "GitHub App";

export type AccountMenuProps = {
  login: string;
  avatarUrl?: string;
  mode: AuthMode;
  accounts: SavedAccount[];
  pending?: boolean;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onSignOut: () => void;
  onOrganizations?: () => void;
  organizationsConnected?: boolean;
};

export function AccountMenu({
  login,
  avatarUrl,
  mode,
  accounts,
  pending,
  onSwitch,
  onAdd,
  onSignOut,
  onOrganizations,
  organizationsConnected,
}: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarAccount
          login={login}
          avatarUrl={avatarUrl}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[260px]">
        <DropdownMenuLabel>
          {login} · {authModeLabel(mode)}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={accounts.find((account) => account.active)?.id ?? ""}
          onValueChange={onSwitch}
        >
          {accounts.map((account) => (
            <DropdownMenuRadioItem
              key={account.id}
              value={account.id}
              disabled={pending || account.active}
            >
              {account.login} · {authModeLabel(account.mode)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={onAdd}
        >
          Add account…
        </DropdownMenuItem>
        {onOrganizations ? (
          <DropdownMenuItem
            disabled={pending}
            onSelect={onOrganizations}
          >
            {organizationsConnected ? "Reconnect organizations…" : "Connect organizations…"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={pending}
          variant="destructive"
          onSelect={onSignOut}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
