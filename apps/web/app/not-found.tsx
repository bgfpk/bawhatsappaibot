import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, FileQuestion, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Page Not Found | BlackArrow",
  description: "The page you are looking for does not exist or may have been moved.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 1.5rem",
        backgroundColor: "var(--ca-canvas)",
        color: "var(--ca-text-primary)",
      }}
    >
      <div
        style={{
          maxWidth: "38rem",
          width: "100%",
          textAlign: "center",
          backgroundColor: "var(--ca-surface-1)",
          border: "1px solid var(--ca-border-subtle)",
          borderRadius: "1rem",
          padding: "3rem 2rem",
          boxShadow: "var(--ca-shadow-raised)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "4rem",
            height: "4rem",
            borderRadius: "50%",
            backgroundColor: "var(--ca-brand-soft)",
            border: "1px solid var(--ca-border-subtle)",
            color: "var(--ca-brand)",
            marginBottom: "1.5rem",
          }}
        >
          <FileQuestion size={32} />
        </div>

        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ca-brand-strong)",
            marginBottom: "0.5rem",
          }}
        >
          404 Error
        </p>

        <h1
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "var(--ca-text-primary)",
            marginBottom: "1rem",
          }}
        >
          Page Not Found
        </h1>

        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "var(--ca-text-secondary)",
            marginBottom: "2rem",
          }}
        >
          The page you are looking for does not exist or may have been moved. Return to the homepage, check our setup documentation, or contact support.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.25rem",
              borderRadius: "0.5rem",
              backgroundColor: "var(--ca-brand)",
              color: "var(--ca-text-inverse)",
              fontWeight: 700,
              fontSize: "0.9375rem",
              textDecoration: "none",
              transition: "opacity 0.2s ease",
            }}
          >
            <ArrowLeft size={16} />
            <span>Return Home</span>
          </Link>

          <Link
            href="/docs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.25rem",
              borderRadius: "0.5rem",
              backgroundColor: "var(--ca-surface-2)",
              color: "var(--ca-text-primary)",
              border: "1px solid var(--ca-border-subtle)",
              fontWeight: 600,
              fontSize: "0.9375rem",
              textDecoration: "none",
              transition: "background-color 0.2s ease",
            }}
          >
            <BookOpen size={16} />
            <span>Read Documentation</span>
          </Link>

          <Link
            href="/contact"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.25rem",
              borderRadius: "0.5rem",
              backgroundColor: "var(--ca-surface-2)",
              color: "var(--ca-text-primary)",
              border: "1px solid var(--ca-border-subtle)",
              fontWeight: 600,
              fontSize: "0.9375rem",
              textDecoration: "none",
              transition: "background-color 0.2s ease",
            }}
          >
            <Mail size={16} />
            <span>Contact Support</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
