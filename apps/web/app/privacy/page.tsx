import { LegalDocumentPage } from "@/components/legal-document";
import { PRIVACY_DOCUMENT } from "@/lib/legal-content";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata("/privacy");

export default function PrivacyPage() {
  return <LegalDocumentPage document={PRIVACY_DOCUMENT} pathname="/privacy" />;
}
