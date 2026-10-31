import type { PluginProps } from "@interview/plugin-sdk/react";
import { Editor } from "./editor";
import { PluginLink } from "./links";
import { Overview } from "./overview";
import { strings } from "./strings";

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Routes inside the plugin: `/` (progress) and `/criteria/:criterionId` (review form). */
export const App: React.FC<PluginProps> = ({ host, context }) => {
  const text = strings(context.locale);
  const url = new URL(context.location, "http://plugin.local");
  const match = /^\/criteria\/([^/]+)\/?$/.exec(url.pathname);
  const criterionId = match ? decodeSegment(match[1]) : null;

  if (url.pathname === "/")
    return (
      <Overview
        host={host}
        context={context}
        text={text}
        savedCriterionId={url.searchParams.get("saved")}
      />
    );
  if (criterionId !== null && context.user.role === "investor")
    return (
      <Editor
        key={`${context.user.id}:${criterionId}`}
        host={host}
        context={context}
        text={text}
        criterionId={criterionId}
      />
    );
  return (
    <div role="alert" className="space-y-4 rounded-lg border border-border bg-card p-6">
      <p>{criterionId !== null ? text.investorOnly : text.pageNotFound}</p>
      <PluginLink host={host} context={context} to="/" className="text-primary underline">
        {text.backToOverview}
      </PluginLink>
    </div>
  );
};
