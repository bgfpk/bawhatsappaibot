import { LegalDocumentPage } from "@/components/legal-document";
import { TERMS_DOCUMENT } from "@/lib/legal-content";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata("/terms");

export default function TermsPage() {
  return <LegalDocumentPage document={TERMS_DOCUMENT} pathname="/terms" />;
}
