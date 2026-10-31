import { Link, Route, Routes } from "react-router-dom";
import type { HostSession } from "../../../shared/platform";
import { useI18n } from "../i18n";
import { DocumentDetailPage } from "./document-detail";
import { DocumentList } from "./document-list";
import { DocumentUpload } from "./document-upload";
import { roomPath } from "./paths";

export function DataroomApp({ session }: { session: HostSession }) {
  const { t } = useI18n();
  return (
    <Routes>
      <Route index element={<DocumentList session={session} />} />
      <Route path="documents/new" element={<DocumentUpload session={session} />} />
      <Route path="documents/:documentId" element={<DocumentDetailPage session={session} />} />
      <Route
        path="*"
        element={
          <div role="alert" className="space-y-4">
            <p>{t.documentNotFound}</p>
            <Link to={roomPath(session)} className="text-primary underline">
              {t.backToList}
            </Link>
          </div>
        }
      />
    </Routes>
  );
}
