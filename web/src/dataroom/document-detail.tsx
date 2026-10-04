import { FileText, Lock } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@biyard/components";
import { useDocument } from "../api/hooks/use-documents";
import { Modal } from "../components/modal";
import { useI18n } from "../i18n";
import { StatusBadge } from "./status-badge";

export function DocumentDetail({
  userId,
  workspaceId,
  workspaceName,
}: {
  userId: string;
  workspaceId: string;
  workspaceName: string;
}) {
  const { t, locale } = useI18n();
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const { documentId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const document = useDocument(userId, workspaceId, documentId);
  const q = params.get("q") ?? "";
  const close = () =>
    navigate(
      `/workspace/${encodeURIComponent(workspaceId)}${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    );
  const doc = document.data;
  const notFound = (document.error as { status?: number } | null)?.status === 404;
  const labelId = "document-modal-title";
  return (
    <Modal
      labelId={labelId}
      closeLabel={t.closeContent}
      onClose={close}
      header={
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <FileText aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            <h2 id={labelId} className="min-w-0 break-words text-heading-5 font-semibold">
              {doc ? doc.title : t.documents}
            </h2>
          </div>
          {doc ? (
            <p className="break-all text-caption text-muted-foreground">
              <span className="sr-only">{t.documentFileName}: </span>
              {doc.fileName} · <span className="sr-only">{t.documentCreatedAt}: </span>
              <time dateTime={doc.createdAt}>{format.format(new Date(doc.createdAt))}</time>
            </p>
          ) : null}
        </div>
      }
    >
      {document.isPending ? (
        <p role="status">{t.loading}</p>
      ) : notFound ? (
        <p role="alert">{t.documentNotFound}</p>
      ) : document.isError ? (
        <div role="alert" className="flex flex-col items-start gap-4">
          <p>{t.documentError}</p>
          <Button variant="outline" className="min-h-11" onClick={() => document.refetch()}>
            {t.retry}
          </Button>
        </div>
      ) : doc ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="sr-only">{t.documentStatus}: </span>
              <StatusBadge status={doc.status} />
            </span>
            <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
              <Lock aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">{t.room}: </span>
              {workspaceName}
            </span>
          </div>
          {doc.status !== "ready" ? (
            <p role="note" className="rounded-md border border-border bg-card p-3">
              {t.notEvidenceEligible}
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted p-4">
            <h3 className="sr-only">{t.documentContent}</h3>
            <p className="whitespace-pre-wrap break-words">{doc.content}</p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
