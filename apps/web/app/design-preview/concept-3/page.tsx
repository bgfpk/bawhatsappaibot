import type { Metadata } from "next";

import { ConceptThree } from "@/components/design-previews/concept-three";

export const metadata: Metadata = {
  title: "BlackArrow Design Preview Concept 3",
  description: "High-conversion homepage concept preview for BlackArrow staging.",
  robots: { index: false, follow: false },
};

export default function ConceptThreePage() {
  return <ConceptThree />;
}
