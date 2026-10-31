import { Badge } from "@biyard/components";
import type { DocumentStatus } from "@interview/api-types/DocumentStatus";
import { useI18n } from "../i18n";

const variants = { ready: "success", processing: "warning", failed: "danger" } as const;
const labels = {
  ready: "statusReady",
  processing: "statusProcessing",
  failed: "statusFailed",
} as const;

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useI18n();
  return <Badge variant={variants[status]}>{t[labels[status]]}</Badge>;
}
