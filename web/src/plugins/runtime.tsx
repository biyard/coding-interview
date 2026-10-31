import { createPluginCall } from "./host-call";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@biyard/components";
import type { Plugin, PluginContext, PluginHost } from "@interview/plugin-sdk";
import type { InstalledPlugin } from "../../../shared/platform";
import { expireSession } from "../auth/session";
import { useI18n } from "../i18n";
import { loadPlugin } from "./loader";
import { pluginPath } from "./navigation";
export function RuntimePlugin({
  plugin,
  context,
}: {
  plugin: InstalledPlugin;
  context: PluginContext;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const container = useRef<HTMLDivElement>(null);
  const live = useRef<Plugin | null>(null);
  const current = useRef(context);
  const navigation = useRef(navigate);
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    navigation.current = navigate;
  }, [navigate]);
  useEffect(() => {
    current.current = {
      ...context,
      location: `${context.location}${location.search}${location.hash}`,
    };
    live.current?.update(current.current);
  }, [context, location.search, location.hash]);
  useEffect(() => {
    const controller = new AbortController();
    const styles: HTMLLinkElement[] = [];
    let mounted: Plugin | null = null;
    const base = `/workspace/${encodeURIComponent(context.workspaceId)}/plugins/${plugin.id}`;
    setState("loading");
    void (async () => {
      try {
        const loaded = await loadPlugin(plugin.manifestUrl, plugin.id, controller.signal);
        if (controller.signal.aborted) return;
        await Promise.all(
          loaded.manifest.styles.map(
            (href) =>
              new Promise<void>((resolve, reject) => {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = href;
                link.onload = () => resolve();
                link.onerror = () => reject(new Error("Plugin stylesheet unavailable"));
                controller.signal.addEventListener(
                  "abort",
                  () => reject(new Error("Plugin unloaded")),
                  { once: true },
                );
                styles.push(link);
                document.head.append(link);
              }),
          ),
        );
        if (controller.signal.aborted || !container.current) return;
        const documentHref = (documentId: string) =>
          `/workspace/${encodeURIComponent(current.current.workspaceId)}/documents/${encodeURIComponent(documentId)}`;
        const host: PluginHost = {
          get context() {
            return current.current;
          },
          call: createPluginCall({
            pluginId: plugin.id,
            workspaceId: () => current.current.workspaceId,
            signal: controller.signal,
            onUnauthorized: expireSession,
          }),
          navigate(path) {
            navigation.current(pluginPath(base, path));
          },
          documentHref,
          openDocument(documentId) {
            navigation.current(documentHref(documentId));
          },
        };
        mounted = loaded.plugin;
        mounted.mount(container.current, host);
        live.current = mounted;
        setState("ready");
      } catch {
        if (!controller.signal.aborted) {
          mounted?.unmount();
          mounted = null;
          styles.forEach((link) => link.remove());
          setState("error");
        }
      }
    })();
    return () => {
      controller.abort();
      live.current = null;
      mounted?.unmount();
      styles.forEach((link) => link.remove());
    };
  }, [plugin.id, plugin.manifestUrl, context.workspaceId, attempt]);
  return (
    <>
      {state === "loading" ? <p role="status">{t.loading}</p> : null}
      {state === "error" ? (
        <div role="alert" className="space-y-4">
          <p>{t.pluginError}</p>
          <Button onClick={() => retry((value) => value + 1)}>{t.retry}</Button>
        </div>
      ) : null}
      <div ref={container} />
    </>
  );
}
