import type { Viewer } from "../shared/platform";
export type Locale = "ko" | "en";
export interface PluginContext {
  user: Viewer;
  workspaceId: string;
  locale: Locale;
  location: string;
}
export interface PluginHost {
  context: PluginContext;
  call<T = unknown>(
    method: string,
    params?: unknown,
    options?: { target?: "dataroom"; signal?: AbortSignal },
  ): Promise<T>;
  navigate(path: string): void;
  /** Host URL of a data room document, so plugins can link to it without knowing host routes. */
  documentHref(documentId: string): string;
  openDocument(documentId: string): void;
}
/** Method → params/result map generated from Rust (e.g. `DataroomRpcContract`). */
export type RpcContract = { [method: string]: { params: unknown; result: unknown } };
export type RpcClient<C extends RpcContract> = <M extends keyof C & string>(
  method: M,
  params: C[M]["params"],
  options?: { signal?: AbortSignal },
) => Promise<C[M]["result"]>;
export function createRpcClient<C extends RpcContract>(
  host: PluginHost,
  target?: "dataroom",
): RpcClient<C> {
  return function call<M extends keyof C & string>(
    method: M,
    params: C[M]["params"],
    options?: { signal?: AbortSignal },
  ) {
    return host.call<C[M]["result"]>(method, params, { ...options, target });
  };
}
export interface Plugin {
  mount(element: HTMLElement, host: PluginHost): void;
  update(context: PluginContext): void;
  unmount(): void;
}
export interface PluginManifest {
  id: string;
  name: string;
  contract: 1;
  entry: string;
  styles: string[];
}
export interface PluginRpcError extends Error {
  status: number;
  kind: string;
}
export function isPluginRpcError(error: unknown): error is PluginRpcError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    "kind" in error &&
    typeof error.kind === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}
export const scopedKey = (context: PluginContext, ...parts: readonly unknown[]) =>
  [context.user.id, context.workspaceId, ...parts] as const;
