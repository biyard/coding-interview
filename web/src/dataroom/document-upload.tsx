import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input } from "@biyard/components";
import type { HostSession } from "../../../shared/platform";
import { useI18n } from "../i18n";
import { errorStatus, useCreateDocument } from "./api";
import { fill, formatBytes } from "./format";
import { documentPath, roomPath } from "./paths";
import {
  MAX_TITLE_CHARS,
  exceedsRequestLimit,
  fileStem,
  readTextFile,
  titleProblem,
  type FileProblem,
  type TextFile,
} from "./validation";

export function DocumentUpload({ session }: { session: HostSession }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const create = useCreateDocument(session);
  const titleInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latestRead = useRef(0);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<TextFile | null>(null);
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null);
  const [reading, setReading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (session.user.role !== "company")
    return (
      <div role="alert" className="space-y-4 rounded-lg border border-border bg-card p-6">
        <p>{t.uploadOnlyCompany}</p>
        <Link to={roomPath(session)} className="text-primary underline">
          {t.backToList}
        </Link>
      </div>
    );

  const titleError = submitted ? titleProblem(title) : null;
  const fileError = fileProblem ?? (submitted && !file ? "fileRequired" : null);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    const readId = ++latestRead.current;
    setFile(null);
    setFileProblem(null);
    if (!picked) return;
    setReading(true);
    const result = await readTextFile(picked);
    // Ignore a slow read that finished after the user already picked another file.
    if (readId !== latestRead.current) return;
    setReading(false);
    if ("problem" in result) {
      setFileProblem(result.problem);
      return;
    }
    setFile(result);
    setTitle((current) =>
      current.trim() ? current : [...fileStem(result.name)].slice(0, MAX_TITLE_CHARS).join(""),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    // Focus the first invalid field in visual order: the file picker comes before the title.
    if (!file || fileProblem) {
      fileInput.current?.focus();
      return;
    }
    if (titleProblem(title)) {
      titleInput.current?.focus();
      return;
    }
    const params = { title: title.trim(), fileName: file.name, content: file.content };
    if (
      exceedsRequestLimit({ workspaceId: session.workspace.id, method: "createDocument", params })
    ) {
      setFileProblem("fileTooLarge");
      fileInput.current?.focus();
      return;
    }
    create.mutate(params, {
      onSuccess: (document) =>
        navigate(documentPath(session, document.id), { state: { created: true } }),
    });
  }

  const serverError = (() => {
    switch (errorStatus(create.error)) {
      case 403:
        return t.uploadForbidden;
      case 400:
        return t.uploadRejected;
      case 413:
        return t.fileTooLarge;
      default:
        return t.uploadError;
    }
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to={roomPath(session)}
        className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
      >
        ← {t.backToList}
      </Link>
      <form
        noValidate
        onSubmit={submit}
        aria-labelledby="upload-heading"
        className="space-y-6 rounded-lg border border-border bg-card p-6"
      >
        <div className="space-y-1">
          <h1 id="upload-heading" className="text-heading-4 font-semibold">
            {t.uploadTitle}
          </h1>
          <p className="text-muted-foreground">{t.uploadHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="document-file" className="font-semibold">
            {t.fileLabel}
          </label>
          <input
            id="document-file"
            ref={fileInput}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={chooseFile}
            disabled={create.isPending}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={
              fileError ? "document-file-status document-file-error" : "document-file-status"
            }
            className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:font-semibold file:text-secondary-foreground"
          />
          <p
            id="document-file-status"
            aria-live="polite"
            className="text-caption text-muted-foreground"
          >
            {reading
              ? t.loading
              : file
                ? fill(t.selectedFile, { name: file.name, size: formatBytes(file.bytes) })
                : ""}
          </p>
          {fileError ? (
            <p id="document-file-error" className="text-destructive">
              {t[fileError]}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="document-title" className="font-semibold">
            {t.titleLabel}
          </label>
          <Input
            id="document-title"
            ref={titleInput}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={create.isPending}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "document-title-error" : undefined}
            className="min-h-11"
          />
          {titleError ? (
            <p id="document-title-error" className="text-destructive">
              {t[titleError]}
            </p>
          ) : null}
        </div>

        {create.isError ? (
          <p role="alert" className="rounded-md bg-destructive-muted px-4 py-3 text-destructive">
            {serverError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={create.isPending || reading} className="min-h-11">
            {create.isPending ? t.uploading : t.submitUpload}
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to={roomPath(session)}>{t.cancel}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
