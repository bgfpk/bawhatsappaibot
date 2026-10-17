import type { Metadata } from "next";

import { ConceptTwo } from "@/components/design-previews/concept-two";

export const metadata: Metadata = {
  title: "BlackArrow Design Preview Concept 2",
  description: "Editorial B2B homepage concept preview for BlackArrow staging.",
  robots: { index: false, follow: false },
};

export default function ConceptTwoPage() {
  return <ConceptTwo />;
}
