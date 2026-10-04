import { isPluginRpcError } from "@interview/plugin-sdk";
import type { PluginProps } from "@interview/plugin-sdk/react";
import { LoadingNotice, QueryError } from "./common";
import { useDocument } from "./hooks";
import { Modal } from "./modal";
import { FileText } from "lucide-react";
import { Badge } from "@biyard/components";
import { getText } from "./text";

/** 근거 자료 미리보기 모달. 열렸을 때만 마운트되어 documents.get을 호출한다. */
export function DocumentPreview({
  host,
  context,
  documentId,
  label,
  onClose,
}: PluginProps & { documentId: string; label: string; onClose: () => void }) {
  const text = getText(context);
  const query = useDocument({ host, context }, documentId);
  const notFound = isPluginRpcError(query.error) && query.error.status === 404;
  const doc = query.data?.document;
  const created = doc
    ? new Intl.DateTimeFormat(context.locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(doc.createdAt),
      )
    : null;

  return (
    <Modal
      labelId="preview-title"
      fixedBody
      header={
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <FileText aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            <h2 id="preview-title" className="min-w-0 break-words text-heading-5 font-semibold">
              {text.previewTitle(doc?.title ?? label)}
            </h2>
          </div>
          {doc ? (
            <p className="break-all text-caption text-muted-foreground">
              <span className="sr-only">{text.fileName}: </span>
              <span>{doc.fileName}</span> · <span className="sr-only">{text.createdAt}: </span>
              <time dateTime={doc.createdAt}>{created}</time>
            </p>
          ) : null}
        </div>
      }
      closeLabel={text.close}
      onClose={onClose}
    >
      {query.isPending ? <LoadingNotice text={text} /> : null}
      {query.isError ? (
        <QueryError
          message={notFound ? text.documentNotFound : text.documentError}
          retryLabel={text.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {doc ? (
        <article className="flex min-h-0 flex-1 flex-col gap-4">
          <div>
            <span className="sr-only">{text.status}: </span>
            <Badge
              variant={
                doc.status === "ready" ? "success" : doc.status === "failed" ? "danger" : "warning"
              }
            >
              {text.docStatus[doc.status]}
            </Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted p-4">
            <h3 className="sr-only">{text.content}</h3>
            <p className="whitespace-pre-wrap break-words">{doc.content}</p>
          </div>
        </article>
      ) : null}
    </Modal>
  );
}
