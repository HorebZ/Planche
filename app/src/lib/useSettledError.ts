import { useState } from "react";

/** Keep the last failure visible until its replacement request settles. */
export function useSettledError(message: string | null, pending: boolean, scope: string) {
  const [last, setLast] = useState({ scope, message });
  const next = last.scope !== scope ? message : pending ? (last.message ?? message) : message;

  if (last.scope !== scope || last.message !== next) {
    setLast({ scope, message: next });
  }

  return next;
}
