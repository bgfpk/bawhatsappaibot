import { Metadata } from "next";
import { Homepage } from "@/components/homepage/homepage";

export const metadata: Metadata = {
  title: "BlackArrow — Automate WhatsApp Sales, Support, Orders, and Follow-Ups with AI",
  description: "Connect your business WhatsApp, train the assistant with your products and policies, and automate routine customer conversations while your team stays in control.",
  robots: { index: false, follow: false },
};

export default function HomepagePrototypePage() {
  return <Homepage />;
}
