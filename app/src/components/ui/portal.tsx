import { createContext, useContext } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

/** Radix portals render into this element instead of document.body, so they inherit its theme class. */
export const PortalContainerProvider = PortalContainerContext.Provider;

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
