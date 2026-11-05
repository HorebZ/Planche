import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef } from "react";
import { notify } from "@/components/ui/toast";
import { commands } from "@/ipc/bindings.types";
import { boardAccountEpoch, errorMessage } from "@/ipc/queries";
import { useUi } from "@/stores/ui";

export function useIssueLink(account: string) {
  const client = useQueryClient();
  const request = useRef(0);

  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  return (url: string) => {
    const current = ++request.current;
    const epoch = boardAccountEpoch(client);
    const context = useUi.getState().contextVersion;
    const active = () =>
      current === request.current &&
      epoch === boardAccountEpoch(client) &&
      context === useUi.getState().contextVersion;
    const external = () =>
      void openUrl(url).catch((error) =>
        notify(`Could not open link: ${errorMessage(error)}`, "error"),
      );

    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/[1-9]\d*\/?$/.test(url)) {
      external();
      return;
    }

    void commands
      .resolveIssue(account, url)
      .then((content) => {
        if (!active()) {
          return;
        }

        if (content) {
          useUi.getState().setLinkedIssue({ content, url });
        } else {
          external();
        }
      })
      .catch(() => {
        if (active()) {
          external();
        }
      });
  };
}
