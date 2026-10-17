import type { Metadata } from "next";

import { ConceptOne } from "@/components/design-previews/concept-one";

export const metadata: Metadata = {
  title: "BlackArrow Design Preview Concept 1",
  description: "Premium product-led homepage concept preview for BlackArrow staging.",
  robots: { index: false, follow: false },
};

export default function ConceptOnePage() {
  return <ConceptOne />;
}
