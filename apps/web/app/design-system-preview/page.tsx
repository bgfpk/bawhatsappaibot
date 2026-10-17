import type { Metadata } from "next";
import { PrimitiveGallery } from "./primitive-gallery";

export const metadata: Metadata = {
  title: "BlackArrow Design System Preview | M1.2 Shared Primitives",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DesignSystemPreviewPage() {
  return <PrimitiveGallery />;
}
