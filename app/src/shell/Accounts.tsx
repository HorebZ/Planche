import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountMenu } from "@/components/ui/account-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { commands } from "@/ipc/bindings.types";
import { authQuery, errorMessage, useAuth } from "@/ipc/queries";
import { SignInStep } from "@/onboarding/Onboarding";

export function useAccounts() {
  const client = useQueryClient();
  const auth = useAuth();
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => commands.authAccounts(),
    enabled: Boolean(auth.data?.login),
  });
  const switchAccount = useMutation({
    mutationFn: (id: string) => commands.authSwitchAccount(id),
    onSuccess: (status) => client.setQueryData(authQuery.queryKey, status),
    onError: (error) => notify(errorMessage(error)),
  });
  const signOut = useMutation({
    mutationFn: () => commands.authSignOut(),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: authQuery.queryKey });
      await client.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error) => notify(errorMessage(error)),
  });

  return {
    accounts,
    switchAccount,
    signOut,
    pending: switchAccount.isPending || signOut.isPending,
  };
}

export function AccountsMenu({
  onAdd,
  onOrganizations,
}: {
  onAdd: () => void;
  onOrganizations?: () => void;
}) {
  const auth = useAuth();
  const { accounts, switchAccount, signOut, pending } = useAccounts();

  return (
    <>
      <AccountMenu
        login={auth.data?.login ?? ""}
        avatarUrl={auth.data?.avatar_url ?? undefined}
        mode={auth.data?.mode ?? "pat"}
        accounts={accounts.data ?? []}
        pending={pending}
        onSwitch={(id) => switchAccount.mutate(id)}
        onAdd={onAdd}
        onSignOut={() => signOut.mutate()}
        onOrganizations={
          auth.data?.mode === "oauth" && auth.data.organizations_available
            ? onOrganizations
            : undefined
        }
        organizationsConnected={auth.data?.organizations_connected}
      />
      {accounts.error ? (
        <span
          role="alert"
          className="text-fg-3 text-xs"
        >
          {errorMessage(accounts.error)}
        </span>
      ) : null}
    </>
  );
}

export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[calc(100vh-32px)] max-w-[560px] overflow-y-auto p-0">
        <DialogTitle className="sr-only">Add GitHub account</DialogTitle>
        <DialogDescription className="sr-only">
          Connect another account with OAuth or a classic PAT. Your other accounts stay saved.
        </DialogDescription>
        {open ? (
          <SignInStep
            embedded
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
