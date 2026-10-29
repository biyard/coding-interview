import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@interview/api-client/runtime/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@biyard/components";
import { Link, useParams } from "react-router-dom";
import { dataroomKeys, getDocument } from "./api";
import type { DataroomText } from "./copy";

export function DocumentDetail({
  workspaceId,
  locale,
  text,
}: {
  workspaceId: string;
  locale: "ko" | "en";
  text: DataroomText;
}) {
  const { documentId = "" } = useParams();
  const document = useQuery({
    queryKey: dataroomKeys.document(workspaceId, documentId),
    queryFn: () => getDocument(workspaceId, { documentId }),
    enabled: Boolean(documentId),
  });
  const listPath = `/workspace/${encodeURIComponent(workspaceId)}`;
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
      <Button asChild variant="ghost">
        <Link to={listPath}>← {text.backToList}</Link>
      </Button>
      {document.isPending ? <p role="status">{text.loading}</p> : null}
      {document.isError ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-border bg-card p-6"
        >
          <p>
            {document.error instanceof ApiError && document.error.status === 404
              ? text.documentNotFound
              : text.loadError}
          </p>
          <Button variant="outline" onClick={() => document.refetch()}>
            {text.retry}
          </Button>
        </div>
      ) : null}
      {document.data ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                  {new Intl.DateTimeFormat(locale, {
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
