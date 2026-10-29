import { useQuery } from "@tanstack/react-query";
import {
  isPluginRpcError,
  type PluginContext,
  type PluginHost,
} from "@interview/plugin-sdk";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@biyard/components";
import { getEvidenceDocument, reviewKeys } from "./api";
import type { ReviewText } from "./copy";

export function EvidenceDocumentDetail({
  host,
  context,
  documentId,
  criterionId,
  text,
}: {
  host: PluginHost;
  context: PluginContext;
  documentId: string;
  criterionId: string | null;
  text: ReviewText;
}) {
  const document = useQuery({
    queryKey: reviewKeys.document(context, documentId),
    queryFn: () => getEvidenceDocument(host, documentId),
  });
  const backPath = criterionId
    ? `/criteria/${encodeURIComponent(criterionId)}`
    : "/";
  const status = document.data?.status;
  const statusLabel = status
    ? { ready: text.ready, processing: text.processing, failed: text.failed }[
        status
      ]
    : "";
  const statusVariant = status
    ? ({ ready: "success", processing: "warning", failed: "danger" } as const)[
        status
      ]
    : "default";

  return (
    <section className="space-y-6">
      <Button variant="ghost" onClick={() => host.navigate(backPath)}>
        ← {text.back}
      </Button>
      {document.isPending ? <p role="status">{text.documentLoading}</p> : null}
      {document.isError ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-border bg-card p-6"
        >
          <p>
            {isPluginRpcError(document.error) && document.error.status === 404
              ? text.documentNotFound
              : text.documentError}
          </p>
          <Button variant="outline" onClick={() => document.refetch()}>
            {text.retry}
          </Button>
        </div>
      ) : null}
      {document.data ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-caption font-semibold text-muted-foreground">
                {text.documentDetail}
              </p>
              <CardTitle className="text-heading-3">
                {document.data.title}
              </CardTitle>
            </div>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="grid gap-4 rounded-md bg-secondary/50 p-4 sm:grid-cols-3">
              <div>
                <dt className="text-caption font-semibold text-muted-foreground">
                  {text.fileName}
                </dt>
                <dd className="mt-1 break-all">{document.data.fileName}</dd>
              </div>
              <div>
                <dt className="text-caption font-semibold text-muted-foreground">
                  {text.status}
                </dt>
                <dd className="mt-1">{statusLabel}</dd>
              </div>
              <div>
                <dt className="text-caption font-semibold text-muted-foreground">
                  {text.createdAt}
                </dt>
                <dd className="mt-1">
                  {new Intl.DateTimeFormat(context.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(document.data.createdAt))}
                </dd>
              </div>
            </dl>
            <div className="space-y-2">
              <h2 className="font-semibold">{text.content}</h2>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4 font-sans text-body-sm">
                {document.data.content}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
