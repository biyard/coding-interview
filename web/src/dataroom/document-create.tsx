import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@interview/api-client/runtime/client";
import type { CreateDocumentParams } from "@interview/api-types/CreateDocumentParams";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@biyard/components";
import { Link, useNavigate } from "react-router-dom";
import {
  createDocument,
  createDocumentRequestBytes,
  dataroomKeys,
} from "./api";
import type { DataroomText } from "./copy";

const MAX_TITLE_CHARS = 200;
const MAX_FILE_NAME_CHARS = 255;
const MAX_CONTENT_BYTES = 204_800;
const MAX_REQUEST_BYTES = 256 * 1024;

type FileData = {
  fileName: string;
  content: string;
  bytes: number;
};

function characterCount(value: string) {
  return Array.from(value).length;
}

function validFileName(fileName: string) {
  return (
    fileName.trim().length > 0 &&
    characterCount(fileName) <= MAX_FILE_NAME_CHARS &&
    !fileName.includes("/") &&
    !fileName.includes("\\") &&
    !fileName.includes("\0") &&
    /\.(txt|md)$/i.test(fileName)
  );
}

export function DocumentCreate({
  workspaceId,
  text,
}: {
  workspaceId: string;
  text: DataroomText;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<FileData | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const listPath = `/workspace/${encodeURIComponent(workspaceId)}`;
  const create = useMutation({
    mutationFn: (params: CreateDocumentParams) =>
      createDocument(workspaceId, params),
    onSuccess: async (document) => {
      queryClient.setQueryData(
        dataroomKeys.document(workspaceId, document.id),
        document,
      );
      await queryClient.invalidateQueries({
        queryKey: dataroomKeys.documents(workspaceId),
      });
      navigate(
        `/workspace/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(document.id)}`,
        { replace: true },
      );
    },
  });

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    setInputError(null);
    setFile(null);
    if (!selected) return;
    if (!validFileName(selected.name)) {
      setInputError(text.fileNameInvalid);
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_CONTENT_BYTES) {
      setInputError(text.fileTooLarge);
      event.target.value = "";
      return;
    }
    try {
      const bytes = await selected.arrayBuffer();
      if (bytes.byteLength > MAX_CONTENT_BYTES) {
        setInputError(text.fileTooLarge);
        event.target.value = "";
        return;
      }
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (content.includes("\0")) {
        setInputError(text.invalidContent);
        event.target.value = "";
        return;
      }
      setFile({ fileName: selected.name, content, bytes: bytes.byteLength });
      if (!title.trim()) setTitle(selected.name.replace(/\.(txt|md)$/i, ""));
    } catch {
      setInputError(text.invalidUtf8);
      event.target.value = "";
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setInputError(null);
    const normalizedTitle = title.trim();
    if (
      !normalizedTitle ||
      characterCount(normalizedTitle) > MAX_TITLE_CHARS ||
      title.includes("\0")
    ) {
      setInputError(text.titleInvalid);
      return;
    }
    if (!file) {
      setInputError(text.fileRequired);
      return;
    }
    const params: CreateDocumentParams = {
      title: normalizedTitle,
      fileName: file.fileName,
      content: file.content,
    };
    if (createDocumentRequestBytes(workspaceId, params) > MAX_REQUEST_BYTES) {
      setInputError(text.requestTooLarge);
      return;
    }
    create.mutate(params);
  }

  const mutationError =
    create.error instanceof ApiError && create.error.status === 403
      ? text.forbidden
      : create.error instanceof ApiError && create.error.status === 413
        ? text.requestTooLarge
        : text.createError;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost">
        <Link to={listPath}>← {text.backToList}</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-3">{text.createTitle}</CardTitle>
          <p className="text-muted-foreground">{text.createDescription}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="document-title">{text.titleLabel}</Label>
              <Input
                id="document-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={text.titlePlaceholder}
                disabled={create.isPending}
                required
              />
              <p className="text-caption text-muted-foreground">
                {characterCount(title)}/{MAX_TITLE_CHARS}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document-file">{text.fileLabel}</Label>
              <Input
                id="document-file"
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={selectFile}
                disabled={create.isPending}
                required
                aria-describedby="document-file-help"
              />
              <p
                id="document-file-help"
                className="text-caption text-muted-foreground"
              >
                {text.fileHelp}
              </p>
              {file ? (
                <p className="rounded-md bg-secondary p-3 text-body-sm">
                  {text.selectedFile}:{" "}
                  <span className="font-semibold">{file.fileName}</span> (
                  {file.bytes.toLocaleString()} bytes)
                </p>
              ) : null}
            </div>
            {inputError ? (
              <p role="alert" className="text-destructive">
                {inputError}
              </p>
            ) : null}
            {create.isError ? (
              <p role="alert" className="text-destructive">
                {mutationError}
              </p>
            ) : null}
            {create.isPending ? <p role="status">{text.saving}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild type="button" variant="outline">
                <Link to={listPath}>{text.cancel}</Link>
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {text.save}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
