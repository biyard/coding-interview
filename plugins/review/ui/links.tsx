import type { MouseEvent, ReactNode } from "react";
import type { PluginContext, PluginHost } from "@interview/plugin-sdk";

const plainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** A real link (so it can be opened in a new tab) that navigates inside the plugin on a plain click. */
export function PluginLink({
  host,
  context,
  to,
  className,
  children,
}: {
  host: PluginHost;
  context: PluginContext;
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const href = `/workspace/${encodeURIComponent(context.workspaceId)}/plugins/review${to}`;
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        host.navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function DocumentLink({
  host,
  documentId,
  className,
  children,
}: {
  host: PluginHost;
  documentId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={host.documentHref(documentId)}
      className={className}
      onClick={(event) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        host.openDocument(documentId);
      }}
    >
      {children}
    </a>
  );
}
