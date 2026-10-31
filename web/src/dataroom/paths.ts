import type { HostSession } from "../../../shared/platform";

export const roomPath = (session: HostSession) =>
  `/workspace/${encodeURIComponent(session.workspace.id)}`;

export const documentPath = (session: HostSession, documentId: string) =>
  `${roomPath(session)}/documents/${encodeURIComponent(documentId)}`;
