import { Navigate, Route, Routes } from "react-router-dom";
import type { HostSession } from "../../../shared/platform";
import { useI18n } from "../i18n";
import { dataroomCopy } from "./copy";
import { DocumentCreate } from "./document-create";
import { DocumentDetail } from "./document-detail";
import { DocumentList } from "./document-list";

export function DataroomApp({ session }: { session: HostSession }) {
  const { locale } = useI18n();
  const text = dataroomCopy[locale];
  const { workspace, user } = session;
  const listPath = `/workspace/${encodeURIComponent(workspace.id)}`;

  return (
    <Routes>
      <Route
        index
        element={
          <DocumentList
            workspaceId={workspace.id}
            role={user.role}
            locale={locale}
            text={text}
          />
        }
      />
      <Route
        path="documents/new"
        element={
          user.role === "company" ? (
            <DocumentCreate workspaceId={workspace.id} text={text} />
          ) : (
            <Navigate to={listPath} replace />
          )
        }
      />
      <Route
        path="documents/:documentId"
        element={
          <DocumentDetail
            workspaceId={workspace.id}
            locale={locale}
            text={text}
          />
        }
      />
      <Route path="*" element={<Navigate to={listPath} replace />} />
    </Routes>
  );
}
