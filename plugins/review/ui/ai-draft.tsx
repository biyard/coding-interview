import { Button } from "@biyard/components";
import type { ReviewDraft } from "@interview/api-types/ReviewDraft";
import { rpcError } from "./api";
import { fill, type Strings } from "./strings";

interface Props {
  text: Strings;
  /** The form already has input, so a draft would replace it (undo is offered afterwards). */
  hasInput: boolean;
  disabled: boolean;
  pending: boolean;
  error: unknown;
  applied: ReviewDraft | null;
  onCreate(): void;
  onUndo(): void;
}

/** Generating, failed (with retry when it can help) and applied states of the AI draft. */
export function AiDraftPanel({
  text,
  hasInput,
  disabled,
  pending,
  error,
  applied,
  onCreate,
  onUndo,
}: Props) {
  const kind = error ? (rpcError(error)?.kind ?? null) : null;
  // Retrying cannot fix a server without a key or a room without ready documents.
  const retryable = error !== null && kind !== "ai_unavailable" && kind !== "no_ready_documents";
  const failure =
    kind === "ai_unavailable"
      ? text.aiUnavailable
      : kind === "no_ready_documents"
        ? text.aiNoDocuments
        : kind === "ai_refused"
          ? text.aiRefused
          : text.aiFailed;

  return (
    <section
      aria-labelledby="ai-draft-heading"
      className="space-y-3 rounded-lg border border-dashed border-border bg-card p-4"
    >
      <h2 id="ai-draft-heading" className="font-semibold">
        {text.aiTitle}
      </h2>
      <p className="text-caption text-muted-foreground">{text.aiIntro}</p>
      {error ? null : (
        <Button
          type="button"
          variant="outline"
          onClick={onCreate}
          disabled={disabled}
          className="min-h-11"
        >
          {hasInput ? text.aiReplace : text.aiCreate}
        </Button>
      )}
      {pending ? <p role="status">{text.aiPending}</p> : null}
      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md bg-destructive-muted px-4 py-3 text-destructive"
        >
          <p>
            {failure} {text.aiManualStillWorks}
          </p>
          {retryable ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCreate}
              disabled={disabled}
              className="min-h-11"
            >
              {text.retry}
            </Button>
          ) : null}
        </div>
      ) : null}
      {applied ? (
        <div role="status" className="space-y-2 rounded-md bg-accent px-4 py-3">
          <p>{fill(text.aiApplied, { count: applied.consideredDocumentCount })}</p>
          {/* Named here because the checked documents can be far down a long list. */}
          {applied.evidence.length === 0 ? (
            <p>{text.aiNoEvidence}</p>
          ) : (
            <p>
              {fill(text.aiEvidence, {
                titles: applied.evidence.map((item) => item.title).join(", "),
              })}
            </p>
          )}
          {applied.discardedEvidenceCount > 0 ? (
            <p>{fill(text.aiDiscarded, { count: applied.discardedEvidenceCount })}</p>
          ) : null}
          {applied.omittedDocumentCount > 0 ? (
            <p>{fill(text.aiOmitted, { count: applied.omittedDocumentCount })}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onUndo}
            disabled={disabled}
            className="min-h-11"
          >
            {text.aiUndo}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
