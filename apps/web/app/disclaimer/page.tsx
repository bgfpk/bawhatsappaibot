import { LegalDocumentPage } from "@/components/legal-document";
import { DISCLAIMER_DOCUMENT } from "@/lib/legal-content";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata("/disclaimer");

export default function DisclaimerPage() {
  return <LegalDocumentPage document={DISCLAIMER_DOCUMENT} pathname="/disclaimer" />;
}
